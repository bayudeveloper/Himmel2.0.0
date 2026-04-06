/**
 * [ Text to Image ]
 * Provider 1 (Primary)  : live3d.io
 * Provider 2 (Fallback) : Pollinations AI (instant, no polling)
 *
 * FLOW (2 endpoint — solusi Vercel timeout):
 *
 *  STEP 1 — GET /ai/txt2img/create?prompt=&ratio=&apikey=
 *    → Submit job ke live3d, return task_id + fp
 *    → Return: { status, task_id, fp, source }
 *
 *  STEP 2 — GET /ai/txt2img/result?task_id=&fp=&apikey=
 *    → Cek status 1x saja (client yang polling tiap 4–5 detik)
 *    → Return: { status, done: true/false, url? }
 *
 *  Kalau live3d /create gagal → langsung fallback Pollinations (instant, 1 request)
 *
 * Contoh flow client:
 *   1. GET /ai/txt2img/create?prompt=xxx → dapat { task_id, fp } atau { url } langsung
 *   2. Kalau ada task_id → poll GET /ai/txt2img/result?task_id=xxx&fp=xxx tiap 4 detik
 *      → done: false → ulangi
 *      → done: true  → ambil url
 */

const { requireApiKey } = require('../../lib/apiKeyAuth');
const crypto = require('crypto');

let CryptoJS;
try { CryptoJS = require('crypto-js'); } catch (_) { CryptoJS = null; }

// ── live3d.io helpers ────────────────────────────────────────────────────────
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCwlO+boC6cwRo3UfXVBadaYwcX
0zKS2fuVNY2qZ0dgwb1NJ+/Q9FeAosL4ONiosD71on3PVYqRUlL5045mvH2K9i8b
AFVMEip7E6RMK6tKAAif7xzZrXnP1GZ5Rijtqdgwh+YmzTo39cuBCsZqK9oEoeQ3
r/myG9S+9cR5huTuFQIDAQAB
-----END PUBLIC KEY-----`;

const APP_ID = 'aifaceswap';
const U_ID   = '1H5tRtzsBkqXcaJ';

function genRandStr(len) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function aesenc(data, key) {
    if (!CryptoJS) throw new Error('crypto-js not installed');
    const k = CryptoJS.enc.Utf8.parse(key);
    return CryptoJS.AES.encrypt(data, k, {
        iv: k,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
    }).toString();
}

function rsaenc(data) {
    return crypto.publicEncrypt(
        { key: PUBLIC_KEY, padding: crypto.constants.RSA_PKCS1_PADDING },
        Buffer.from(data, 'utf8')
    ).toString('base64');
}

function genCryptoHeaders(type, fp = null) {
    const n           = Math.floor(Date.now() / 1000);
    const r           = crypto.randomUUID();
    const i           = genRandStr(16);
    const fingerPrint = fp || crypto.randomBytes(16).toString('hex');
    const s           = rsaenc(i);
    const signStr     = type === 'upload'
        ? `${APP_ID}:${r}:${s}`
        : `${APP_ID}:${U_ID}:${n}:${r}:${s}`;
    return {
        fp:        fingerPrint,
        fp1:       aesenc(`${APP_ID}:${fingerPrint}`, i),
        'x-guide': s,
        'x-sign':  aesenc(signStr, i),
        'x-code':  Date.now().toString()
    };
}

const BASE_HDR = {
    'User-Agent':    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
    'Accept':        'application/json, text/plain, */*',
    'origin':        'https://live3d.io',
    'referer':       'https://live3d.io/',
    'theme-version': '83EmcUoQTUv50LhNx0VrdcK8rcGexcP35FcZDcpgWsAXEyO4xqL5shCY6sFIWB2Q',
};

// Submit job ke live3d — return { task_id, fp }
async function live3dCreate(prompt, aspectRatio = '1:1') {
    if (!CryptoJS) throw new Error('crypto-js not installed');
    const ch = genCryptoHeaders('create');
    const res = await fetch('https://app.live3d.io/aitools/of/create', {
        method: 'POST',
        headers: { ...BASE_HDR, 'Content-Type': 'application/json', ...ch },
        body: JSON.stringify({
            fn_name:       'demo-image-editor',
            call_type:     3,
            input:         { model: 'nano_banana_pro', source_images: [], prompt, aspect_radio: aspectRatio, request_from: 9 },
            data:          '',
            request_from:  9,
            origin_from:   '8f3f0c7387123ae0'
        }),
        signal: AbortSignal.timeout(8000)
    });
    const data = await res.json();
    if (!data?.data?.task_id) throw new Error('live3d create failed: ' + JSON.stringify(data));
    return { task_id: data.data.task_id, fp: ch.fp };
}

// Cek status job live3d — 1x check saja
async function live3dCheck(task_id, fp) {
    if (!CryptoJS) throw new Error('crypto-js not installed');
    const ch2 = genCryptoHeaders('check', fp);
    const res = await fetch('https://app.live3d.io/aitools/of/check-status', {
        method: 'POST',
        headers: { ...BASE_HDR, 'Content-Type': 'application/json', ...ch2 },
        body: JSON.stringify({
            task_id,
            fn_name:      'demo-image-editor',
            call_type:    3,
            request_from: 9,
            origin_from:  '8f3f0c7387123ae0'
        }),
        signal: AbortSignal.timeout(8000)
    });
    const data = await res.json();
    const result = data?.data;
    if (!result) throw new Error('live3d check: response kosong');

    if (result.status === 2 && result.result_image) {
        return { done: true, url: 'https://temp.live3d.io/' + result.result_image };
    }
    if (result.status === 3) {
        throw new Error('live3d: job failed di server');
    }
    return { done: false };
}

// ── Pollinations AI — instant, tidak perlu polling ───────────────────────────
function pollinationsUrl(prompt, ratio = '1:1') {
    const sizes = {
        '1:1':  { w: 1024, h: 1024 },
        '16:9': { w: 1280, h: 720  },
        '9:16': { w: 720,  h: 1280 },
        '4:3':  { w: 1024, h: 768  },
        '3:4':  { w: 768,  h: 1024 },
    };
    const { w, h } = sizes[ratio] || sizes['1:1'];
    const seed = Math.floor(Math.random() * 9999999);
    const enc  = encodeURIComponent(prompt);
    return `https://image.pollinations.ai/prompt/${enc}?width=${w}&height=${h}&seed=${seed}&nologo=true&enhance=true`;
}

async function pollinationsGenerate(prompt, ratio = '1:1') {
    const url = pollinationsUrl(prompt, ratio);
    // Verifikasi URL accessible (HEAD request, max 8 detik)
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error('Pollinations tidak merespons: ' + res.status);
    return url;
}

// ── Route ─────────────────────────────────────────────────────────────────────
module.exports = (app) => {

    // STEP 1 — Submit job
    app.get('/ai/txt2img/create', requireApiKey('ai'), async (req, res) => {
        const { prompt, ratio = '1:1', negative = '' } = req.query;

        if (!prompt || !prompt.trim()) {
            return res.status(400).json({ status: false, error: 'Parameter ?prompt= wajib diisi.' });
        }

        const validRatios = ['1:1', '16:9', '9:16', '4:3', '3:4'];
        const aspectRatio = validRatios.includes(ratio) ? ratio : '1:1';
        const p = prompt.trim();

        // Coba live3d dulu (async submit, cepat)
        if (CryptoJS) {
            try {
                const { task_id, fp } = await live3dCreate(p, aspectRatio);
                return res.json({
                    status:  true,
                    source:  'live3d',
                    task_id,
                    fp,
                    prompt:  p,
                    ratio:   aspectRatio,
                    message: 'Job submitted. Poll /ai/txt2img/result?task_id=xxx&fp=xxx tiap 4 detik.'
                });
            } catch (err) {
                console.warn('[txt2img] live3d create gagal, fallback pollinations:', err.message);
            }
        }

        // Fallback: Pollinations — langsung return URL
        try {
            const url = await pollinationsGenerate(p, aspectRatio);
            return res.json({
                status: true,
                source: 'pollinations',
                done:   true,
                prompt: p,
                ratio:  aspectRatio,
                url,
            });
        } catch (err) {
            console.warn('[txt2img] pollinations juga gagal:', err.message);
            // Terakhir: return URL pollinations tanpa verifikasi (tetap bisa dipakai)
            const url = pollinationsUrl(p, aspectRatio);
            return res.json({
                status: true,
                source: 'pollinations',
                done:   true,
                prompt: p,
                ratio:  aspectRatio,
                url,
            });
        }
    });

    // STEP 2 — Cek hasil (client polling ini tiap 4–5 detik)
    app.get('/ai/txt2img/result', requireApiKey('ai'), async (req, res) => {
        const { task_id, fp } = req.query;

        if (!task_id || !fp) {
            return res.status(400).json({ status: false, error: 'Parameter ?task_id= dan ?fp= wajib diisi.' });
        }

        try {
            const result = await live3dCheck(task_id, fp);
            return res.json({ status: true, ...result });
        } catch (err) {
            return res.json({ status: false, error: err.message });
        }
    });

    // Backward compat — /ai/txt2img langsung (Pollinations only, instant)
    app.get('/ai/txt2img', requireApiKey('ai'), async (req, res) => {
        const { prompt, ratio = '1:1' } = req.query;

        if (!prompt || !prompt.trim()) {
            return res.status(400).json({ status: false, error: 'Parameter ?prompt= wajib diisi.' });
        }

        const validRatios = ['1:1', '16:9', '9:16', '4:3', '3:4'];
        const aspectRatio = validRatios.includes(ratio) ? ratio : '1:1';
        const p = prompt.trim();

        const url = pollinationsUrl(p, aspectRatio);
        return res.json({
            status: true,
            source: 'pollinations',
            prompt: p,
            ratio:  aspectRatio,
            url,
        });
    });
};
