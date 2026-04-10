/**
 * [ AI Banana — Image to Image ]
 *  Base    : https://aibanana.net
 *  Endpoint: GET /ai/aibanana-i2i?url=&prompt=&ratio=&apikey=
 *  Model   : qwen-image (image-to-image)
 *
 *  Flow: download gambar dari URL → kirim ke aibanana sebagai multipart binary
 */

const axios  = require('axios');
const crypto = require('crypto');
const FormData = require('form-data');
const { requireApiKey } = require('../../lib/apiKeyAuth');

const SOLVER_URL = 'https://cf-solver-renofc.my.id/api/solvebeta';
const BASE_URL   = 'https://aibanana.net';
const SITE_KEY   = '0x4AAAAAAB2-fh9F_EBQqG2_';

const OS_LIST = [
    'Windows NT 10.0; Win64; x64',
    'Macintosh; Intel Mac OS X 10_15_7',
    'X11; Linux x86_64',
    'Windows NT 6.1; Win64; x64',
];

const RESOLUTIONS = [
    { w: 1366, h: 768  }, { w: 1920, h: 1080 }, { w: 1440, h: 900  },
    { w: 1536, h: 864  }, { w: 1280, h: 720  }, { w: 1600, h: 900  },
];

const LANGUAGES = [
    'en-US,en;q=0.9',
    'id-ID,id;q=0.9,en-US;q=0.8',
    'en-GB,en;q=0.9',
];

const PLATFORMS = ['Windows', 'Linux', 'macOS', 'Chrome OS'];
const RATIOS    = ['1:1', '16:9', '9:16', '4:3', '3:4'];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function randomUA() {
    const os  = rand(OS_LIST);
    const ver = Math.floor(Math.random() * 40) + 100;
    return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver}.0.0.0 Safari/537.36`;
}

function randomIP() {
    return [1,2,3,4].map(() => Math.floor(Math.random() * 254) + 1).join('.');
}

// ── Solve Turnstile ───────────────────────────────────────────────────────────
async function solveTurnstile() {
    const res = await axios.post(SOLVER_URL, {
        url:     BASE_URL,
        siteKey: SITE_KEY,
        mode:    'turnstile-min',
    }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
    });
    const token = res.data?.token?.result?.token;
    if (!token) throw new Error('Turnstile solver gagal mengembalikan token');
    return token;
}

// ── Download gambar dari URL ke buffer ────────────────────────────────────────
async function downloadBuffer(imageUrl) {
    const res = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 20000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const ct       = res.headers['content-type'] || 'image/jpeg';
    const mimeType = ct.split(';')[0].trim();
    const ext      = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
    return { buffer: Buffer.from(res.data), mimeType, ext };
}

// ── Generate image-to-image ───────────────────────────────────────────────────
async function aibananai2i(imageBuffer, mimeType, ext, prompt, aspectRatio = '1:1') {
    const turnstileToken = await solveTurnstile();

    const fingerprint   = crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex');
    const deviceId      = crypto.randomBytes(8).toString('hex');
    const ua            = randomUA();
    const viewport      = rand(RESOLUTIONS);
    const platform      = rand(PLATFORMS);
    const language      = rand(LANGUAGES);
    const chromeVersion = Math.floor(Math.random() * 30) + 110;

    const form = new FormData();
    form.append('prompt',            prompt);
    form.append('model',             'qwen-image');
    form.append('mode',              'image-to-image');
    form.append('numImages',         '1');
    form.append('aspectRatio',       aspectRatio);
    form.append('clientFingerprint', fingerprint);
    form.append('turnstileToken',    turnstileToken);
    form.append('deviceId',          deviceId);
    form.append('image',             imageBuffer, {
        filename:    `input.${ext}`,
        contentType: mimeType,
    });

    const res = await axios.post(`${BASE_URL}/api/image-generation`, form, {
        headers: {
            ...form.getHeaders(),
            'Accept':             '*/*',
            'Accept-Language':    language,
            'Origin':             BASE_URL,
            'Referer':            `${BASE_URL}/`,
            'User-Agent':         ua,
            'Sec-Ch-Ua':          `"Chromium";v="${chromeVersion}", "Not-A.Brand";v="24", "Google Chrome";v="${chromeVersion}"`,
            'Sec-Ch-Ua-Mobile':   '?0',
            'Sec-Ch-Ua-Platform': `"${platform}"`,
            'Viewport-Width':     String(viewport.w),
            'Viewport-Height':    String(viewport.h),
            'X-Forwarded-For':    randomIP(),
            'Cache-Control':      'no-cache',
            'Pragma':             'no-cache',
        },
        timeout: 60000,
    });

    if (!res.data?.success) throw new Error('aibanana: ' + JSON.stringify(res.data));
    if (!res.data?.images?.[0]?.url) throw new Error('aibanana: URL gambar tidak ada di response');

    return res.data;
}

// ── Route ─────────────────────────────────────────────────────────────────────
module.exports = function (app) {
    app.get('/ai/aibanana-i2i', requireApiKey('ai'), async (req, res) => {
        const { url, prompt, ratio = '1:1' } = req.query;

        if (!url)    return res.json({ status: false, message: 'Parameter ?url= wajib diisi' });
        if (!prompt) return res.json({ status: false, message: 'Parameter ?prompt= wajib diisi' });

        const aspectRatio = RATIOS.includes(ratio) ? ratio : '1:1';

        try {
            const { buffer, mimeType, ext } = await downloadBuffer(url);
            const data = await aibananai2i(buffer, mimeType, ext, prompt.trim(), aspectRatio);

            return res.json({
                status: true,
                prompt: prompt.trim(),
                ratio:  aspectRatio,
                url:    data.images[0].url,
                width:  data.images[0].width,
                height: data.images[0].height,
                model:  data.model,
            });
        } catch (err) {
            return res.json({
                status:  false,
                message: err.message || 'Terjadi kesalahan',
            });
        }
    });
};
