const axios   = require('axios');
const cheerio = require('cheerio');
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

            const rawHtml = msgRes.data?.message?.html || '';
            const rawText = msgRes.data?.message?.text || '';

            // ── Method 1: Cek subject email langsung ─────────────────────
            // Subject: "[Nanobana] Your Sign-In Code: 545423"
            const subject = messages[0].subject || '';
            const subjMatch = subject.match(/[:\s]+(\d{6})$/);
            if (subjMatch) return subjMatch[1];

            // ── Method 2: Parse HTML dengan cheerio ───────────────────────
            const $ = cheerio.load(rawHtml);
            $('script, style').remove();

            // Kumpulkan semua teks dari elemen, termasuk yang dipisah newline
            const allText = $('body').text()
                .replace(/[\r\n\t]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            // Format "5 4 5 4 2 3" (inline dengan spasi)
            const m1 = allText.match(/(\d)\s+(\d)\s+(\d)\s+(\d)\s+(\d)\s+(\d)/);
            if (m1) return m1.slice(1, 7).join('');

            // ── Method 3: Kumpulin semua digit dari elemen satu per satu ──
            // Tangani grid 3x2: tiap digit dalam elemen terpisah
            const digits = [];
            $('*').each((_, el) => {
                const txt = $(el).clone().children().remove().end().text().trim();
                if (/^\d$/.test(txt)) digits.push(txt);
            });
            if (digits.length >= 6) return digits.slice(0, 6).join('');

            // ── Method 4: Regex di raw text ───────────────────────────────
            const plainText = rawText + ' ' + allText;

            const m2 = plainText.match(/Sign-In Code[:\s]+(\d{6})/i);
            if (m2) return m2[1];

            const m3 = plainText.match(/code[:\s]+(\d{6})/i);
            if (m3) return m3[1];

            const m4 = plainText.match(/\b(\d{6})\b/);
            if (m4) return m4[1];

            // ── Method 5: Ambil semua digit, gabung ambil 6 pertama ───────
            const allDigits = (rawText + allText).replace(/\D/g, '');
            if (allDigits.length >= 6) return allDigits.substring(0, 6);

        } catch (_) {}
    }
    throw new Error('OTP timeout — kode tidak diterima dalam 2 menit');
}

// ─── Nanobana ─────────────────────────────────────────────────────────────────
const BASE_HDR = {
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
    console.log('[sora] email:', mailData.email, '| provider:', mailData.provider);

    // 1. Init halaman
    const page = await axios.get('https://www.nanobana.net/m/sora2',
        { headers: BASE_HDR, timeout: 20000 }
    );
    cookies.extract(page);

    // 2. Kirim OTP
    const sendRes = await axios.post('https://www.nanobana.net/api/auth/email/send',
        { email: mailData.email },
        { headers: { ...BASE_HDR, Cookie: cookies.get() }, timeout: 20000 }
    );
    cookies.extract(sendRes);
    console.log('[sora] send-code response:', JSON.stringify(sendRes.data).slice(0, 100));

    // 3. Tunggu OTP
    const code = await waitForOTP(mailData);
    console.log('[sora] otp:', code);

    // 4. CSRF
    const csrfRes = await axios.get('https://www.nanobana.net/api/auth/csrf',
        { headers: { ...BASE_HDR, Cookie: cookies.get() }, timeout: 15000 }
    );
    cookies.extract(csrfRes);
    const csrf = csrfRes.data?.csrfToken;

    // 5. Login
    const loginData = new URLSearchParams({
        email:       mailData.email,
        code,
        redirect:    'false',
        csrfToken:   csrf,
        callbackUrl: 'https://www.nanobana.net/m/sora2'
    });
    const loginRes = await axios.post(
        'https://www.nanobana.net/api/auth/callback/email-code',
        loginData.toString(),
        {
            headers: {
                ...BASE_HDR,
                'Content-Type':           'application/x-www-form-urlencoded',
                'x-auth-return-redirect': '1',
                Cookie:                   cookies.get()
            },
            timeout: 20000
        }
    );
    cookies.extract(loginRes);

    // 6. Session
    await axios.get('https://www.nanobana.net/api/auth/session',
        { headers: { ...BASE_HDR, Cookie: cookies.get() }, timeout: 15000 }
    ).then(r => cookies.extract(r));

    // 7. Submit
    const submitRes = await axios.post(
        'https://www.nanobana.net/api/sora2/text-to-video/generate',
        { prompt, aspect_ratio, n_frames, remove_watermark: true },
        { headers: { ...BASE_HDR, Cookie: cookies.get() }, timeout: 30000 }
    );
    cookies.extract(submitRes);

    const taskId = submitRes.data?.taskId;
    if (!taskId) throw new Error('Tidak dapat taskId: ' + JSON.stringify(submitRes.data).slice(0, 200));
    console.log('[sora] taskId:', taskId);

    // 8. Poll
    const pendingStatus = ['processing', 'waiting', 'queued', 'pending', 'in_queue', 'starting'];
    const start         = Date.now();

    while (Date.now() - start < 8 * 60 * 1000) {
        await delay(5000);
        const statusRes = await axios.get(
            `https://www.nanobana.net/api/sora2/text-to-video/task/${taskId}?save=1&prompt=${encodeURIComponent(prompt)}`,
            { headers: { ...BASE_HDR, Cookie: cookies.get() }, timeout: 20000 }
        );
        cookies.extract(statusRes);
        const raw = statusRes.data;
        console.log('[sora] poll raw:', JSON.stringify(raw).slice(0, 400));

        const task   = raw?.data || raw?.task || raw;
        const status = (task?.status || '').toLowerCase();
        const url    = task?.resultUrls?.[0] || task?.result_url || task?.video_url
                    || task?.videoUrl || task?.saved?.[0]?.url || raw?.resultUrls?.[0];

        if (!pendingStatus.includes(status)) {
            if (['failed', 'error'].includes(status)) {
                throw new Error('Generate gagal: ' + (task?.error_message || task?.failMessage || JSON.stringify(raw).slice(0, 200)));
            }
            if (url) return url;
            throw new Error('Status unknown, raw: ' + JSON.stringify(raw).slice(0, 300));
        }
    }
    throw new Error('Timeout >8 menit');
}

// ─── Endpoint ─────────────────────────────────────────────────────────────────
module.exports = function(app) {
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
            console.error('[sora] error:', err.message);
            return res.status(500).json({ status: false, error: err.message });
        }
    });
};
