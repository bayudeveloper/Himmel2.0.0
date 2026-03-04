const axios   = require('axios');
const cheerio = require('cheerio');
const crypto  = require('crypto');
const { requireApiKey } = require('../../lib/apiKeyAuth');

const delay = ms => new Promise(r => setTimeout(r, ms));
const TEMP_MAIL = 'https://himmel-temp-mail-v155.vercel.app';

// ─── Temp Mail ────────────────────────────────────────────────────────────────
async function createEmail() {
    for (let i = 0; i < 5; i++) {
        const res = await axios.post(`${TEMP_MAIL}/api/generate`, { email: '' }, { timeout: 15000 });
        if (res.data?.success && res.data.provider !== 'guerrilla') return res.data;
        await delay(1000);
    }
    const res = await axios.post(`${TEMP_MAIL}/api/generate`, { email: '' }, { timeout: 15000 });
    if (!res.data?.success) throw new Error('Gagal buat temp email');
    return res.data;
}

async function waitForOTP(mailData, maxWait = 120000) {
    const { email, token, provider } = mailData;
    const start = Date.now();

    while (Date.now() - start < maxWait) {
        await delay(5000);
        try {
            const inboxRes = await axios.get(
                `${TEMP_MAIL}/api/inbox/${encodeURIComponent(email)}`,
                { params: { token, provider }, timeout: 12000 }
            );
            const messages = inboxRes.data?.messages || [];
            if (!messages.length) continue;

            const msgRes = await axios.get(
                `${TEMP_MAIL}/api/message/${encodeURIComponent(email)}/${messages[0].id}`,
                { params: { token, provider }, timeout: 12000 }
            );

            const text = msgRes.data?.message?.text || '';
            const html = msgRes.data?.message?.html || '';
            const $    = cheerio.load(html);
            $('script, style').remove();
            const fullText = text + ' ' + $('body').text().replace(/\s+/g, ' ');

            // Format nanobana: "5 4 5 4 2 3"
            const m1 = fullText.match(/(\d)\s(\d)\s(\d)\s(\d)\s(\d)\s(\d)/);
            if (m1) return m1.slice(1, 7).join('');

            const m2 = fullText.match(/(?:code|kode)[:\s]+(\d{6})/i);
            if (m2) return m2[1];

            const m3 = fullText.match(/\b(\d{6})\b/);
            if (m3) return m3[1];
        } catch (_) {}
    }
    throw new Error('OTP timeout — kode tidak diterima dalam 2 menit');
}

// ─── Nanobana Auth ────────────────────────────────────────────────────────────
const NANO_HDR = {
    'User-Agent':      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    'Accept':          'application/json, text/plain, */*',
    'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
    'Content-Type':    'application/json',
    'Origin':          'https://www.nanobana.net',
    'Referer':         'https://www.nanobana.net/m/sora2'
};

function createCookieStore() {
    const store = {};
    return {
        extract(res) {
            const c = res.headers['set-cookie'];
            if (!c) return;
            c.forEach(s => {
                const p = s.split(';')[0].split('=');
                if (p.length > 1) store[p[0]] = p.slice(1).join('=');
            });
        },
        get() { return Object.entries(store).map(([k, v]) => `${k}=${v}`).join('; '); }
    };
}

async function generateSora(prompt, aspect_ratio, n_frames) {
    const cookies  = createCookieStore();
    const mailData = await createEmail();

    // 1. Init halaman
    const page = await axios.get('https://www.nanobana.net/m/sora2', { headers: NANO_HDR, timeout: 20000 });
    cookies.extract(page);

    // 2. Kirim OTP
    const sendRes = await axios.post('https://www.nanobana.net/api/auth/email/send',
        { email: mailData.email },
        { headers: { ...NANO_HDR, Cookie: cookies.get() }, timeout: 20000 }
    );
    cookies.extract(sendRes);

    // 3. Tunggu OTP
    const code = await waitForOTP(mailData);

    // 4. CSRF + Login
    const csrfRes = await axios.get('https://www.nanobana.net/api/auth/csrf', {
        headers: { ...NANO_HDR, Cookie: cookies.get() }, timeout: 15000
    });
    cookies.extract(csrfRes);
    const csrf = csrfRes.data?.csrfToken;

    const loginData = new URLSearchParams({
        email: mailData.email, code,
        redirect: 'false', csrfToken: csrf,
        callbackUrl: 'https://www.nanobana.net/m/sora2'
    });
    const loginRes = await axios.post('https://www.nanobana.net/api/auth/callback/email-code',
        loginData.toString(),
        {
            headers: {
                ...NANO_HDR,
                'Content-Type':           'application/x-www-form-urlencoded',
                'x-auth-return-redirect': '1',
                Cookie:                   cookies.get()
            },
            timeout: 20000
        }
    );
    cookies.extract(loginRes);

    await axios.get('https://www.nanobana.net/api/auth/session', {
        headers: { ...NANO_HDR, Cookie: cookies.get() }, timeout: 15000
    }).then(r => cookies.extract(r));

    // 5. Submit generate
    const submitRes = await axios.post('https://www.nanobana.net/api/sora2/text-to-video/generate',
        { prompt, aspect_ratio, n_frames, remove_watermark: true },
        { headers: { ...NANO_HDR, Cookie: cookies.get() }, timeout: 30000 }
    );
    cookies.extract(submitRes);
    const taskId = submitRes.data?.taskId;
    if (!taskId) throw new Error('Tidak dapat taskId: ' + JSON.stringify(submitRes.data).slice(0, 200));

    // 6. Poll sampai selesai
    const pending = ['processing', 'waiting', 'queued'];
    const start   = Date.now();

    while (Date.now() - start < 8 * 60 * 1000) {
        await delay(5000);
        const statusRes = await axios.get(
            `https://www.nanobana.net/api/sora2/text-to-video/task/${taskId}?save=1&prompt=${encodeURIComponent(prompt)}`,
            { headers: { ...NANO_HDR, Cookie: cookies.get() }, timeout: 20000 }
        );
        cookies.extract(statusRes);
        const result = statusRes.data;

        if (!pending.includes(result?.status)) {
            if (['failed', 'error'].includes(result?.status)) {
                throw new Error('Generate gagal: ' + (result.error_message || 'Unknown'));
            }
            const url = result?.resultUrls?.[0] || result?.saved?.[0]?.url;
            if (url) return url;
            throw new Error('Selesai tapi URL tidak ditemukan');
        }
    }
    throw new Error('Timeout >8 menit');
}

// ─── Endpoint ─────────────────────────────────────────────────────────────────
module.exports = function(app) {
    /**
     * GET /ai/sora?prompt=a cat&ratio=landscape&frames=10&apikey=M0NPI
     *
     * Query params:
     *   prompt  : deskripsi video (wajib)
     *   ratio   : landscape / portrait / square (default: landscape)
     *   frames  : 10 / 16 / 24 (default: 10)
     *   apikey  : API key (wajib)
     */
    app.get('/ai/sora', requireApiKey('ai'), async (req, res) => {
        const { prompt, ratio = 'landscape', frames = '10' } = req.query;

        if (!prompt) {
            return res.status(400).json({
                status:  false,
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
