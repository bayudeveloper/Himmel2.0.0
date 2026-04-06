/**
 * [ Text to Image ]
 * Provider 1 (Primary)  : live3d.io
 * Provider 2 (Fallback) : createimg.com
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
        fp: fingerPrint,
        fp1: aesenc(`${APP_ID}:${fingerPrint}`, i),
        'x-guide': s,
        'x-sign': aesenc(signStr, i),
        'x-code': Date.now().toString()
    };
}

const BASE_HDR = {
    'User-Agent':     'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
    'Accept':         'application/json, text/plain, */*',
    'origin':         'https://live3d.io',
    'referer':        'https://live3d.io/',
    'theme-version':  '83EmcUoQTUv50LhNx0VrdcK8rcGexcP35FcZDcpgWsAXEyO4xqL5shCY6sFIWB2Q',
};

async function live3dGenerate(prompt, aspectRatio = '1:1') {
    const ch = genCryptoHeaders('create');
    const createRes = await fetch('https://app.live3d.io/aitools/of/create', {
        method: 'POST',
        headers: { ...BASE_HDR, 'Content-Type': 'application/json', ...ch },
        body: JSON.stringify({
            fn_name: 'demo-image-editor',
            call_type: 3,
            input: { model: 'nano_banana_pro', source_images: [], prompt, aspect_radio: aspectRatio, request_from: 9 },
            data: '',
            request_from: 9,
            origin_from: '8f3f0c7387123ae0'
        }),
    });
    const createData = await createRes.json();
    if (!createData?.data?.task_id) throw new Error('live3d create failed');

    const taskId = createData.data.task_id;
    const fp     = ch.fp;

    let result, attempts = 0;
    do {
        await new Promise(r => setTimeout(r, 4000));
        if (++attempts > 30) throw new Error('live3d timeout');
        const ch2 = genCryptoHeaders('check', fp);
        const statusRes = await fetch('https://app.live3d.io/aitools/of/check-status', {
            method: 'POST',
            headers: { ...BASE_HDR, 'Content-Type': 'application/json', ...ch2 },
            body: JSON.stringify({ task_id: taskId, fn_name: 'demo-image-editor', call_type: 3, request_from: 9, origin_from: '8f3f0c7387123ae0' }),
        });
        const statusData = await statusRes.json();
        result = statusData.data;
    } while (result?.status !== 2);

    return 'https://temp.live3d.io/' + result.result_image;
}

// ── createimg.com helpers ────────────────────────────────────────────────────
const API_BASE = 'https://www.createimg.com?api=v1';
const UA       = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36';
const ORIGIN   = 'https://www.createimg.com';

async function bypassTurnstile() {
    const res = await fetch(
        'https://api.nekolabs.web.id/tools/bypass/cf-turnstile?url=https://www.createimg.com/&siteKey=0x4AAAAAABggkaHPwa2n_WBx',
        { signal: AbortSignal.timeout(15000) }
    );
    const d = await res.json();
    if (!d.success) throw new Error('Turnstile bypass failed');
    return d.result;
}

function genSec() {
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

async function postAPI(params) {
    const r = await fetch(API_BASE, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'User-Agent':   UA,
            'Origin':       ORIGIN,
            'Referer':      `${ORIGIN}/`
        },
        body: params.toString(),
        signal: AbortSignal.timeout(20000)
    });
    return r.json();
}

async function createimgGenerate(prompt, negative = '') {
    const cfToken  = await bypassTurnstile();
    const security = genSec();

    const init = await postAPI(new URLSearchParams({ token: cfToken, security, action: 'turnstile', module: 'create' }));
    if (!init.status) throw new Error('Init failed');

    const create = await postAPI(new URLSearchParams({
        token: cfToken, security, action: 'create',
        server: init.server, prompt,
        negative: negative || '',
        seed: Math.floor(Math.random() * 1e9),
        size: 1024
    }));
    if (!create.status) throw new Error('Create failed');

    const { id, queue } = create;
    for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const q = await postAPI(new URLSearchParams({ id, queue, module: 'create', action: 'queue', server: init.server, token: cfToken, security }));
        if ((q.pending || 0) === 0) break;
        if (i === 59) throw new Error('Timeout waiting for queue');
    }

    const hist = await postAPI(new URLSearchParams({ id, action: 'history', server: init.server, module: 'create', token: cfToken, security }));
    if (!hist.status) throw new Error('History failed');

    const out = await postAPI(new URLSearchParams({ id: hist.file, action: 'output', server: init.server, module: 'create', token: cfToken, security, page: 'home', lang: 'en' }));
    if (!out.status) throw new Error('Output failed');

    return out.data;
}

// ── Route ────────────────────────────────────────────────────────────────────
module.exports = (app) => {
    app.get('/ai/txt2img', requireApiKey, async (req, res) => {
        const { prompt, negative = '', ratio = '1:1' } = req.query;

        if (!prompt || !prompt.trim()) {
            return res.status(400).json({ status: false, error: 'Parameter prompt wajib diisi.' });
        }

        if (!CryptoJS) {
            return res.status(500).json({ status: false, error: 'Dependency crypto-js belum terinstall. Jalankan: npm install crypto-js' });
        }

        const validRatios = ['1:1', '16:9', '9:16', '4:3', '3:4'];
        const aspectRatio = validRatios.includes(ratio) ? ratio : '1:1';

        // Provider 1: live3d.io
        try {
            const imageUrl = await live3dGenerate(prompt.trim(), aspectRatio);
            return res.json({ status: true, source: 'live3d', prompt: prompt.trim(), ratio: aspectRatio, url: imageUrl });
        } catch (err) {
            console.warn('[txt2img] live3d gagal, fallback ke createimg:', err.message);
        }

        // Provider 2 (Fallback): createimg.com
        try {
            const imageUrl = await createimgGenerate(prompt.trim(), negative);
            return res.json({ status: true, source: 'createimg', prompt: prompt.trim(), url: imageUrl });
        } catch (err) {
            console.warn('[txt2img] createimg juga gagal:', err.message);
            return res.status(500).json({ status: false, error: 'Semua provider sedang tidak tersedia. Coba lagi nanti.' });
        }
    });
};
