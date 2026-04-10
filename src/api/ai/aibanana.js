/**
 * [ AI Banana — Text to Image ]
 *  Base    : https://aibanana.net
 *  Endpoint: GET /ai/aibanana?prompt=&ratio=&apikey=
 */

const axios  = require('axios');
const crypto = require('crypto');
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

const RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function randomUA() {
    const os  = rand(OS_LIST);
    const ver = Math.floor(Math.random() * 40) + 100;
    return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver}.0.0.0 Safari/537.36`;
}

function randomIP() {
    return [1,2,3,4].map(() => Math.floor(Math.random() * 254) + 1).join('.');
}

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

async function generateImage(prompt, aspectRatio = '1:1') {
    const turnstileToken = await solveTurnstile();

    const fingerprint   = crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex');
    const deviceId      = crypto.randomBytes(8).toString('hex');
    const ua            = randomUA();
    const viewport      = rand(RESOLUTIONS);
    const platform      = rand(PLATFORMS);
    const language      = rand(LANGUAGES);
    const chromeVersion = Math.floor(Math.random() * 30) + 110;

    const res = await axios.post(`${BASE_URL}/api/image-generation`, {
        prompt,
        model:             'nano-banana-2',
        mode:              'text-to-image',
        numImages:         1,
        aspectRatio,
        clientFingerprint: fingerprint,
        turnstileToken,
        deviceId,
    }, {
        headers: {
            'Content-Type':       'application/json',
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

    if (!res.data) throw new Error('Response kosong dari aibanana');
    return res.data;
}

// ── Route ─────────────────────────────────────────────────────────────────────
module.exports = function (app) {
    app.get('/ai/aibanana', requireApiKey('ai'), async (req, res) => {
        const { prompt, ratio = '1:1' } = req.query;

        if (!prompt || !prompt.trim()) {
            return res.json({ status: false, message: 'Parameter ?prompt= wajib diisi' });
        }

        const aspectRatio = RATIOS.includes(ratio) ? ratio : '1:1';

        try {
            const data = await generateImage(prompt.trim(), aspectRatio);
            return res.json({
                status: true,
                prompt: prompt.trim(),
                ratio:  aspectRatio,
                result: data,
            });
        } catch (err) {
            return res.json({
                status:  false,
                message: err.message || 'Terjadi kesalahan',
            });
        }
    });
};
