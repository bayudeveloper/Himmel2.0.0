const axios  = require('axios');
const crypto = require('crypto');
const { requireApiKey } = require('../../lib/apiKeyAuth');

const delay = ms => new Promise(r => setTimeout(r, ms));

// ─── Temp Mail ────────────────────────────────────────────────────────────────
class TempMail {
    constructor() {
        this.baseUrl   = 'https://akunlama.com';
        this.recipient = crypto.randomBytes(8).toString('hex').substring(0, 10);
        this.lastCount = 0;
        this.headers   = {
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8',
            'referer': 'https://akunlama.com/',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        };
    }

    get email() { return `${this.recipient}@akunlama.com`; }

    async checkInbox() {
        const r = await axios.get(`${this.baseUrl}/api/list`, {
            params:  { recipient: this.recipient },
            headers: { ...this.headers, referer: `https://akunlama.com/inbox/${this.recipient}/list` },
            timeout: 12000
        });
        return r.data;
    }

    async getMsgHtml(msg) {
        const r = await axios.get(`${this.baseUrl}/api/getHtml`, {
            params:  { region: msg.storage.region, key: msg.storage.key },
            headers: this.headers,
            timeout: 12000
        });
        return r.data;
    }

    extractCode(html) {
        // Format email nanobana: "9 1 4 8 7 3" (spasi antara tiap digit)
        // Pattern: digit spasi digit spasi... x6
        const spaced = html.match(/(\d)\s(\d)\s(\d)\s(\d)\s(\d)\s(\d)/);
        if (spaced) return spaced.slice(1, 7).join('');

        // Fallback 1: 6 digit berurutan langsung
        const direct = html.match(/\b(\d{6})\b/);
        if (direct) return direct[1];

        // Fallback 2: strip semua HTML tag, lalu cari 6 digit
        const stripped = html
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&#\d+;/g, ' ')
            .replace(/&[a-z]+;/gi, ' ')
            .replace(/\s+/g, ' ');

        const fromStripped = stripped.match(/\b(\d{6})\b/);
        if (fromStripped) return fromStripped[1];

        // Fallback 3: ambil semua digit, gabung, ambil 6 pertama
        const allDigits = stripped.replace(/\D/g, '');
        if (allDigits.length >= 6) return allDigits.substring(0, 6);

        return null;
    }

    async waitForCode(timeoutMs = 90000) {
        return new Promise((resolve) => {
            const iv = setInterval(async () => {
                try {
                    const inbox = await this.checkInbox();
                    if (inbox.length > this.lastCount) {
                        for (const msg of inbox.slice(this.lastCount)) {
                            const html = await this.getMsgHtml(msg);
                            const code = this.extractCode(html);
                            if (code) { clearInterval(iv); return resolve(code); }
                        }
                        this.lastCount = inbox.length;
                    }
                } catch (_) {}
            }, 4000);
            setTimeout(() => { clearInterval(iv); resolve(null); }, timeoutMs);
        });
    }
}

// ─── Core ─────────────────────────────────────────────────────────────────────
const baseHeaders = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    'sec-ch-ua': '"Chromium";v="131", "Not_A Brand";v="24"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
    'origin':  'https://www.nanobana.net',
    'referer': 'https://www.nanobana.net/m/sora2'
};

function extractCookies(store, res) {
    const setC = res.headers['set-cookie'];
    if (!setC) return;
    setC.forEach(c => {
        const parts = c.split(';')[0].split('=');
        if (parts.length > 1) store[parts[0]] = parts.slice(1).join('=');
    });
}

function cookieString(store) {
    return Object.entries(store).map(([k, v]) => `${k}=${v}`).join('; ');
}

function req(method, url, data, headers, timeout = 20000) {
    return axios({ method, url, data, headers, timeout, validateStatus: () => true });
}

async function generateSora(prompt, aspect_ratio, n_frames) {
    const cookies = {};
    const mail    = new TempMail();

    // 1. Ambil halaman + kirim OTP
    const page = await req('GET', 'https://www.nanobana.net/m/sora2', null, baseHeaders, 20000);
    extractCookies(cookies, page);

    const sendRes = await req('POST', 'https://www.nanobana.net/api/auth/email/send',
        { email: mail.email },
        { ...baseHeaders, 'Content-Type': 'application/json', Cookie: cookieString(cookies) },
        20000
    );
    extractCookies(cookies, sendRes);

    // 2. Tunggu OTP
    const code = await mail.waitForCode(90000);
    if (!code) throw new Error('OTP timeout — email tidak menerima kode. Coba lagi.');

    // 3. Login
    const csrfRes = await req('GET', 'https://www.nanobana.net/api/auth/csrf',
        null, { ...baseHeaders, Cookie: cookieString(cookies) }, 15000);
    extractCookies(cookies, csrfRes);
    const csrfToken = csrfRes.data?.csrfToken;

    const loginData = `email=${encodeURIComponent(mail.email)}&code=${code}&redirect=false&csrfToken=${csrfToken}&callbackUrl=${encodeURIComponent('https://www.nanobana.net/m/sora2')}`;
    const loginRes  = await req('POST', 'https://www.nanobana.net/api/auth/callback/email-code',
        loginData,
        { ...baseHeaders, 'Content-Type': 'application/x-www-form-urlencoded', 'x-auth-return-redirect': '1', Cookie: cookieString(cookies) },
        20000
    );
    extractCookies(cookies, loginRes);

    await req('GET',  'https://www.nanobana.net/api/auth/session',  null, { ...baseHeaders, Cookie: cookieString(cookies) }, 15000);
    await req('POST', 'https://www.nanobana.net/api/get-user-info', '',   { ...baseHeaders, Cookie: cookieString(cookies) }, 15000);

    // 4. Submit generate
    const submitRes = await req('POST',
        'https://www.nanobana.net/api/sora2/text-to-video/generate',
        { prompt, aspect_ratio, n_frames, remove_watermark: true },
        { ...baseHeaders, 'Content-Type': 'application/json', Cookie: cookieString(cookies) },
        30000
    );
    extractCookies(cookies, submitRes);
    const taskId = submitRes.data?.taskId;
    if (!taskId) throw new Error('Gagal mendapatkan Task ID dari server.');

    // 5. Polling sampai selesai (max 8 menit)
    const startPoll = Date.now();
    const MAX_POLL  = 8 * 60 * 1000;
    let result;

    do {
        if (Date.now() - startPoll > MAX_POLL) throw new Error('Generate timeout (>8 menit).');
        await delay(5000);
        const statusRes = await req('GET',
            `https://www.nanobana.net/api/sora2/text-to-video/task/${taskId}?save=1&prompt=${encodeURIComponent(prompt)}`,
            null, { ...baseHeaders, Cookie: cookieString(cookies) }, 20000
        );
        extractCookies(cookies, statusRes);
        result = statusRes.data;
    } while (['processing', 'waiting', 'queued'].includes(result?.status));

    if (['failed', 'error'].includes(result?.status)) {
        throw new Error(`Generate gagal: ${result.error_message || 'Server error'}`);
    }

    let videoUrl = null;
    if (result.resultUrls?.length > 0)  videoUrl = result.resultUrls[0];
    else if (result.saved?.length > 0)  videoUrl = result.saved[0]?.url;
    if (!videoUrl) throw new Error('Video selesai tapi URL tidak ditemukan.');

    return videoUrl;
}

// ─── Endpoint ─────────────────────────────────────────────────────────────────
module.exports = function(app) {
    /**
     * GET /ai/sora?prompt=...&ratio=landscape&frames=10&apikey=M0NPI
     *
     * Query params:
     *   prompt  : deskripsi video (wajib)
     *   ratio   : landscape | portrait | square (default: landscape)
     *   frames  : 10 | 16 | 24 (default: 10)
     *   apikey  : API key (wajib)
     */
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
            const videoUrl = await generateSora(prompt, ratio, parseInt(frames));
            return res.json({
                status: true,
                prompt,
                video: videoUrl
            });
        } catch (err) {
            return res.status(500).json({
                status: false,
                error: err.message
            });
        }
    });
};
