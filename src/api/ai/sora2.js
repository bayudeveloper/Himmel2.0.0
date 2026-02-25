const axios   = require('axios');
const cheerio = require('cheerio');
const crypto  = require('crypto');
const { requireApiKey } = require('../../lib/apiKeyAuth');

const delay = ms => new Promise(r => setTimeout(r, ms));

// ─── Proxy List ───────────────────────────────────────────────────────────────
const PROXIES = [
    '31.59.20.176:6754:yfjfjudg:cebic9so4bvr',
    '23.95.150.145:6114:yfjfjudg:cebic9so4bvr',
    '198.23.239.134:6540:yfjfjudg:cebic9so4bvr',
    '45.38.107.97:6014:yfjfjudg:cebic9so4bvr',
    '107.172.163.27:6543:yfjfjudg:cebic9so4bvr',
    '198.105.121.200:6462:yfjfjudg:cebic9so4bvr',
    '64.137.96.74:6641:yfjfjudg:cebic9so4bvr',
    '216.10.27.159:6837:yfjfjudg:cebic9so4bvr',
    '142.111.67.146:5611:yfjfjudg:cebic9so4bvr',
    '23.26.53.37:6003:yfjfjudg:cebic9so4bvr'
];

function getRandomProxy() {
    const raw = PROXIES[Math.floor(Math.random() * PROXIES.length)];
    const [host, port, user, pass] = raw.split(':');
    return { proxy: { protocol: 'http', host, port: parseInt(port), auth: { username: user, password: pass } } };
}

// ─── Headers ──────────────────────────────────────────────────────────────────
const baseHeaders = {
    'User-Agent':         'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
    'sec-ch-ua':          '"Chromium";v="139", "Not;A=Brand";v="99"',
    'sec-ch-ua-mobile':   '?1',
    'sec-ch-ua-platform': '"Android"',
    'Accept-Language':    'id-ID,id;q=0.9,en-AU;q=0.8,en;q=0.7,en-US;q=0.6'
};

// ─── Cookie Manager ───────────────────────────────────────────────────────────
function createCookieStore() {
    const store = {};
    return {
        extract(res) {
            const setC = res.headers['set-cookie'];
            if (!setC) return;
            setC.forEach(c => {
                const parts = c.split(';')[0].split('=');
                if (parts.length > 1) store[parts[0]] = parts.slice(1).join('=');
            });
        },
        get() { return Object.entries(store).map(([k, v]) => `${k}=${v}`).join('; '); }
    };
}

// ─── Temp Mail ────────────────────────────────────────────────────────────────
async function cekmail(name, pConf) {
    const res = await axios.get(`https://akunlama.com/api/v1/mail/list?recipient=${name}`, { ...pConf, timeout: 12000 });
    return Array.isArray(res.data) && res.data.length === 0 ? `${name}@akunlama.com` : null;
}

async function getotp(name, pConf) {
    let messages = [], tries = 0;
    while (messages.length === 0 && tries < 25) {
        await delay(4000); tries++;
        const res = await axios.get(`https://akunlama.com/api/v1/mail/list?recipient=${name}`, { ...pConf, timeout: 12000 });
        messages = Array.isArray(res.data) ? res.data : [];
    }
    if (!messages.length) return null;

    const mail    = messages[0];
    const htmlRes = await axios.get(
        `https://akunlama.com/api/v1/mail/getHtml?region=${mail.storage.region}&key=${mail.storage.key}`,
        { ...pConf, timeout: 12000 }
    );

    const $ = cheerio.load(htmlRes.data);
    $('script, style').remove();
    const text = $('body').text().replace(/\s+/g, ' ').trim();

    const m1 = text.match(/sign[- ]in[:\s]+(\d{6})/i);
    if (m1) return m1[1];
    const m2 = text.match(/(\d)\s(\d)\s(\d)\s(\d)\s(\d)\s(\d)/);
    if (m2) return m2.slice(1, 7).join('');
    const m3 = text.match(/\b(\d{6})\b/);
    if (m3) return m3[1];
    const digits = text.replace(/\D/g, '');
    if (digits.length >= 6) return digits.substring(0, 6);
    return null;
}

// ─── Main Flow ────────────────────────────────────────────────────────────────
async function generateSora(prompt, aspect_ratio, n_frames) {
    const pConf   = getRandomProxy();
    const cookies = createCookieStore();

    // 1. Buat email temp
    let email = null;
    for (let i = 0; i < 5; i++) {
        const name = crypto.randomBytes(6).toString('hex');
        email = await cekmail(name, pConf);
        if (email) break;
    }
    if (!email) throw new Error('Gagal buat temp email.');
    const name = email.split('@')[0];

    // 2. Kirim OTP
    const sendRes = await axios.post('https://nanobanana.org/api/auth/send-code', { email }, {
        headers: { ...baseHeaders, 'Content-Type': 'application/json', origin: 'https://nanobanana.org', referer: 'https://nanobanana.org/sora2' },
        ...pConf, timeout: 20000
    });
    cookies.extract(sendRes);

    // 3. Ambil OTP
    const code = await getotp(name, pConf);
    if (!code) throw new Error('OTP timeout — kode tidak diterima.');

    // 4. Login
    const csrfRes = await axios.get('https://nanobanana.org/api/auth/csrf', {
        headers: { ...baseHeaders, Cookie: cookies.get() }, ...pConf, timeout: 15000
    });
    cookies.extract(csrfRes);
    const csrfToken = csrfRes.data?.csrfToken;

    const loginData = new URLSearchParams({ email, code, redirect: 'false', csrfToken, callbackUrl: 'https://nanobanana.org/sora2' });
    const loginRes  = await axios.post('https://nanobanana.org/api/auth/callback/email-code', loginData.toString(), {
        headers: { ...baseHeaders, 'Content-Type': 'application/x-www-form-urlencoded', 'x-auth-return-redirect': '1', origin: 'https://nanobanana.org', Cookie: cookies.get() },
        ...pConf, timeout: 20000
    });
    cookies.extract(loginRes);

    const sesRes = await axios.get('https://nanobanana.org/api/auth/session', {
        headers: { ...baseHeaders, Cookie: cookies.get() }, ...pConf, timeout: 15000
    });
    cookies.extract(sesRes);

    // 5. Submit generate
    const submitRes = await axios.post('https://nanobanana.org/api/sora2/submit',
        { model: 'sora2', type: 'text-to-video', prompt, aspect_ratio, n_frames, remove_watermark: true },
        { headers: { ...baseHeaders, 'Content-Type': 'application/json', origin: 'https://nanobanana.org', Cookie: cookies.get() }, ...pConf, timeout: 30000 }
    );
    cookies.extract(submitRes);
    const taskId = submitRes.data?.task_id;
    if (!taskId) throw new Error('Gagal mendapatkan Task ID.');

    // 6. Polling sampai selesai (max 8 menit)
    const pending   = ['processing', 'pending', 'queue', 'in_queue', 'starting'];
    const startPoll = Date.now();
    let result;

    do {
        if (Date.now() - startPoll > 8 * 60 * 1000) throw new Error('Generate timeout (>8 menit).');
        await delay(10000);
        const statusRes = await axios.get(`https://nanobanana.org/api/sora2/status/${taskId}`, {
            headers: { ...baseHeaders, Cookie: cookies.get() }, ...pConf, timeout: 20000
        });
        cookies.extract(statusRes);
        result = statusRes.data?.task;
        if (!result) throw new Error('Gagal cek status task.');
    } while (pending.includes(result.status?.toLowerCase()));

    if (['failed', 'error'].includes(result.status?.toLowerCase())) {
        throw new Error(`Generate gagal: ${result.error_message || 'Server error'}`);
    }

    const videoUrl = result.video_url || result.result || null;
    if (!videoUrl) throw new Error('Video selesai tapi URL tidak ditemukan.');

    return videoUrl;
}

// ─── Endpoint ─────────────────────────────────────────────────────────────────
module.exports = function(app) {
    app.get('/ai/sora', requireApiKey('ai'), async (req, res) => {
        const { prompt, ratio = 'landscape', frames = '10' } = req.query;

        if (!prompt) {
            return res.status(400).json({
                status: false,
                message: "Parameter 'prompt' wajib diisi!",
                contoh:  '/ai/sora?prompt=a cat walking&apikey=M0NPI'
            });
        }

        try {
            const video = await generateSora(prompt, ratio, frames);
            return res.json({ status: true, prompt, video });
        } catch (err) {
            return res.status(500).json({ status: false, error: err.message });
        }
    });
};
