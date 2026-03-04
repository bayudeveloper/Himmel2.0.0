const axios   = require('axios');
const crypto  = require('crypto');
const cheerio = require('cheerio');
const { requireApiKey } = require('../../lib/apiKeyAuth');

const delay = ms => new Promise(r => setTimeout(r, ms));

const TEMP_MAIL = 'https://himmel-temp-mail-v155.vercel.app';

// ─── Temp Mail (Himmel) ───────────────────────────────────────────────────────
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

async function getOTP(mailData, maxWait = 120000) {
    const { email, token, provider } = mailData;
    const start = Date.now();

    while (Date.now() - start < maxWait) {
        await delay(3000);
        try {
            const inboxRes = await axios.get(
                `${TEMP_MAIL}/api/inbox/${encodeURIComponent(email)}`,
                { params: { token, provider }, timeout: 12000 }
            );
            const messages = inboxRes.data?.messages || [];
            if (!messages.length) continue;

            for (const msg of messages) {
                // Method 1: Dari subject langsung (paling reliable)
                // Subject: "[Nanobana] Your Sign-In Code: 545423"
                const subject = msg.subject || '';
                const fromSubject = subject.match(/Code[:\s]+(\d{6})/i);
                if (fromSubject) return fromSubject[1];

                // Method 2: Dari intro/body
                const intro = msg.intro || '';
                const fromIntro = intro.match(/\b(\d{6})\b/);
                if (fromIntro) return fromIntro[1];

                // Method 3: Buka pesan lengkap
                try {
                    const msgRes = await axios.get(
                        `${TEMP_MAIL}/api/message/${encodeURIComponent(email)}/${msg.id}`,
                        { params: { token, provider }, timeout: 12000 }
                    );
                    const text    = msgRes.data?.message?.text || '';
                    const html    = msgRes.data?.message?.html || '';
                    const $       = cheerio.load(html);
                    $('script, style').remove();
                    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
                    const fullText = text + ' ' + bodyText;

                    // Format: "5 4 5 4 2 3" (grid 3x2)
                    const m1 = fullText.match(/(\d)\s+(\d)\s+(\d)\s+(\d)\s+(\d)\s+(\d)/);
                    if (m1) return m1.slice(1, 7).join('');

                    const m2 = fullText.match(/Code[:\s]+(\d{6})/i);
                    if (m2) return m2[1];

                    const m3 = fullText.match(/\b(\d{6})\b/);
                    if (m3) return m3[1];

                    // Kumpulin semua digit dari elemen (handle grid)
                    const digits = [];
                    $('*').each((_, el) => {
                        const t = $(el).clone().children().remove().end().text().trim();
                        if (/^\d$/.test(t)) digits.push(t);
                    });
                    if (digits.length >= 6) return digits.slice(0, 6).join('');

                } catch (_) {}
            }
        } catch (_) {}
    }
    throw new Error('OTP timeout — kode tidak diterima dalam 2 menit');
}

// ─── Nanobana ─────────────────────────────────────────────────────────────────
const HDR = {
    'User-Agent':      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
    'sec-ch-ua':       '"Chromium";v="139", "Not;A=Brand";v="99"',
    'sec-ch-ua-mobile':'?1',
    'sec-ch-ua-platform': '"Android"',
    'Accept-Language': 'id-ID,id;q=0.9,en-AU;q=0.8,en;q=0.7,en-US;q=0.6',
    'origin':          'https://www.nanobana.net',
    'referer':         'https://www.nanobana.net/m/sora2'
};

function makeCookieStore() {
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

async function sora2(prompt, aspect_ratio = 'landscape', n_frames = '10') {
    const cookies  = makeCookieStore();
    const mailData = await createEmail();
    console.log('[sora] email:', mailData.email, '| provider:', mailData.provider);

    // 1. Kirim OTP
    const sendRes = await axios.post('https://www.nanobana.net/api/auth/email/send',
        { email: mailData.email },
        { headers: { ...HDR, 'Content-Type': 'application/json' }, timeout: 20000 }
    );
    cookies.extract(sendRes);
    console.log('[sora] send:', JSON.stringify(sendRes.data).slice(0, 100));

    // 2. Tunggu OTP
    const code = await getOTP(mailData);
    console.log('[sora] otp:', code);

    // 3. CSRF
    const csrfRes = await axios.get('https://www.nanobana.net/api/auth/csrf',
        { headers: { ...HDR, Cookie: cookies.get() }, timeout: 15000 }
    );
    cookies.extract(csrfRes);
    const csrf = csrfRes.data?.csrfToken;

    // 4. Login
    const loginData = `email=${encodeURIComponent(mailData.email)}&code=${code}&redirect=false&csrfToken=${csrf}&callbackUrl=${encodeURIComponent('https://www.nanobana.net/m/sora2')}`;
    const loginRes  = await axios.post('https://www.nanobana.net/api/auth/callback/email-code',
        loginData,
        { headers: { ...HDR, 'Content-Type': 'application/x-www-form-urlencoded', 'x-auth-return-redirect': '1', Cookie: cookies.get() }, timeout: 20000 }
    );
    cookies.extract(loginRes);

    // 5. Session
    const sesRes = await axios.get('https://www.nanobana.net/api/auth/session',
        { headers: { ...HDR, Cookie: cookies.get() }, timeout: 15000 }
    );
    cookies.extract(sesRes);

    // 6. User info (penting! tanpa ini submit bisa gagal)
    const userRes = await axios.post('https://www.nanobana.net/api/get-user-info', '',
        { headers: { ...HDR, Cookie: cookies.get() }, timeout: 15000 }
    );
    cookies.extract(userRes);

    // 7. Submit generate
    const submitRes = await axios.post('https://www.nanobana.net/api/sora2/text-to-video/generate',
        { prompt, aspect_ratio, n_frames, remove_watermark: true },
        { headers: { ...HDR, 'Content-Type': 'application/json', Cookie: cookies.get() }, timeout: 30000 }
    );
    cookies.extract(submitRes);

    const taskId = submitRes.data?.taskId;
    if (!taskId) throw new Error('TaskId tidak ditemukan: ' + JSON.stringify(submitRes.data).slice(0, 200));
    console.log('[sora] taskId:', taskId);

    // 8. Poll status
    let result;
    const pendingStatus = ['processing', 'waiting'];

    do {
        await delay(5000);
        const statusRes = await axios.get(
            `https://www.nanobana.net/api/sora2/text-to-video/task/${taskId}?save=1&prompt=${encodeURIComponent(prompt)}`,
            { headers: { ...HDR, Cookie: cookies.get() }, timeout: 20000 }
        );
        cookies.extract(statusRes);
        result = statusRes.data;
        console.log('[sora] status:', result?.status);
    } while (pendingStatus.includes(result?.status));

    if (['failed', 'error'].includes(result?.status)) {
        throw new Error('Generate gagal: ' + (result?.error_message || 'Prompt mungkin kena filter konten'));
    }

    // 9. Ambil URL video
    let videoUrl = null;
    if (result?.resultUrls?.length)  videoUrl = result.resultUrls[0];
    else if (result?.saved?.length)  videoUrl = result.saved[0]?.url;

    if (!videoUrl) throw new Error('Video selesai tapi URL tidak ditemukan: ' + JSON.stringify(result).slice(0, 200));

    return { task_id: taskId, video: videoUrl };
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
                contoh:  '/ai/sora?prompt=a cat walking&apikey=admin123'
            });
        }

        try {
            const result = await sora2(prompt, ratio, frames);
            return res.json({ status: true, prompt, ...result });
        } catch (err) {
            console.error('[sora] error:', err.message);
            return res.status(500).json({ status: false, error: err.message });
        }
    });
};
