const axios   = require('axios');
const crypto  = require('crypto');
const cheerio = require('cheerio');
const { requireApiKey } = require('../../lib/apiKeyAuth');

const delay = ms => new Promise(r => setTimeout(r, ms));
const TEMP_MAIL = 'https://himmel-temp-mail-v155.vercel.app';

// ─── In-memory Job Store ──────────────────────────────────────────────────────
const jobs = new Map();
setInterval(() => {
    const now = Date.now();
    for (const [id, job] of jobs.entries()) {
        if (now - job.createdAt > 60 * 60 * 1000) jobs.delete(id); // expire 1 jam
    }
}, 15 * 60 * 1000);

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
                // Method 1: dari subject
                const subject = msg.subject || '';
                const m0 = subject.match(/Code[:\s]+(\d{6})/i);
                if (m0) return m0[1];

                // Method 2: buka pesan
                try {
                    const msgRes = await axios.get(
                        `${TEMP_MAIL}/api/message/${encodeURIComponent(email)}/${msg.id}`,
                        { params: { token, provider }, timeout: 12000 }
                    );
                    const text = msgRes.data?.message?.text || '';
                    const html = msgRes.data?.message?.html || '';
                    const $    = cheerio.load(html);
                    $('script, style').remove();
                    const full = text + ' ' + $('body').text().replace(/\s+/g, ' ');

                    const m1 = full.match(/(\d)\s+(\d)\s+(\d)\s+(\d)\s+(\d)\s+(\d)/);
                    if (m1) return m1.slice(1, 7).join('');

                    const m2 = full.match(/Code[:\s]+(\d{6})/i);
                    if (m2) return m2[1];

                    const m3 = full.match(/\b(\d{6})\b/);
                    if (m3) return m3[1];

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
    throw new Error('OTP timeout');
}

// ─── Nanobana ─────────────────────────────────────────────────────────────────
const HDR = {
    'User-Agent':         'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
    'sec-ch-ua':          '"Chromium";v="139", "Not;A=Brand";v="99"',
    'sec-ch-ua-mobile':   '?1',
    'sec-ch-ua-platform': '"Android"',
    'Accept-Language':    'id-ID,id;q=0.9,en-AU;q=0.8,en;q=0.7,en-US;q=0.6',
    'origin':             'https://www.nanobana.net',
    'referer':            'https://www.nanobana.net/m/sora2'
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

// ─── Background Worker ────────────────────────────────────────────────────────
async function processJob(jobId) {
    const job = jobs.get(jobId);
    if (!job) return;
    job.status = 'processing';

    try {
        const cookies  = makeCookieStore();
        const mailData = await createEmail();
        console.log('[sora] email:', mailData.email);

        // 1. Kirim OTP
        const sendRes = await axios.post('https://www.nanobana.net/api/auth/email/send',
            { email: mailData.email },
            { headers: { ...HDR, 'Content-Type': 'application/json' }, timeout: 20000 }
        );
        cookies.extract(sendRes);

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

        // 6. User info
        const userRes = await axios.post('https://www.nanobana.net/api/get-user-info', '',
            { headers: { ...HDR, Cookie: cookies.get() }, timeout: 15000 }
        );
        cookies.extract(userRes);

        // 7. Submit generate
        const submitRes = await axios.post('https://www.nanobana.net/api/sora2/text-to-video/generate',
            { prompt: job.prompt, aspect_ratio: job.ratio, n_frames: job.frames, remove_watermark: true },
            { headers: { ...HDR, 'Content-Type': 'application/json', Cookie: cookies.get() }, timeout: 30000 }
        );
        cookies.extract(submitRes);

        const taskId = submitRes.data?.taskId;
        if (!taskId) throw new Error('TaskId tidak ditemukan: ' + JSON.stringify(submitRes.data).slice(0, 200));

        job.taskId  = taskId;
        job.cookies = cookies;
        job.status  = 'generating';
        console.log('[sora] taskId:', taskId);

        // 8. Poll status
        let result;
        const pendingStatus = ['processing', 'waiting'];

        do {
            await delay(5000);
            const statusRes = await axios.get(
                `https://www.nanobana.net/api/sora2/text-to-video/task/${taskId}?save=1&prompt=${encodeURIComponent(job.prompt)}`,
                { headers: { ...HDR, Cookie: cookies.get() }, timeout: 20000 }
            );
            cookies.extract(statusRes);
            result = statusRes.data;
            console.log('[sora] poll status:', result?.status);
        } while (pendingStatus.includes(result?.status));

        if (['failed', 'error'].includes(result?.status)) {
            throw new Error('Generate gagal: ' + (result?.error_message || 'Prompt kena filter konten'));
        }

        const videoUrl = result?.resultUrls?.[0] || result?.saved?.[0]?.url;
        if (!videoUrl) throw new Error('URL tidak ditemukan: ' + JSON.stringify(result).slice(0, 200));

        job.status     = 'done';
        job.video      = videoUrl;
        job.finishedAt = Date.now();

    } catch (err) {
        console.error('[sora] job error:', err.message);
        job.status     = 'failed';
        job.error      = err.message;
        job.finishedAt = Date.now();
    }
}

// ─── Endpoints ────────────────────────────────────────────────────────────────
module.exports = function(app) {

    /**
     * GET /ai/sora?prompt=a cat&ratio=landscape&frames=10&apikey=M0NPI
     * Submit job, langsung balik job_id
     */
    app.get('/ai/sora', requireApiKey('ai'), (req, res) => {
        const { prompt, ratio = 'landscape', frames = '10' } = req.query;

        if (!prompt) {
            return res.status(400).json({
                status:  false,
                message: "Parameter 'prompt' wajib diisi!",
                contoh:  '/ai/sora?prompt=a cat walking&apikey=M0NPI'
            });
        }

        const jobId = crypto.randomBytes(8).toString('hex');
        jobs.set(jobId, {
            status:    'queued',
            prompt,
            ratio,
            frames,
            video:     null,
            error:     null,
            createdAt: Date.now(),
            finishedAt: null
        });

        processJob(jobId).catch(() => {});

        return res.json({
            status:    true,
            job_id:    jobId,
            prompt,
            message:   'Job diterima! Cek status di endpoint berikut.',
            check_url: `/ai/sora/status/${jobId}?apikey=...`,
            estimated: '2-8 menit'
        });
    });

    /**
     * GET /ai/sora/status/:jobId?apikey=M0NPI
     * Cek status job
     */
    app.get('/ai/sora/status/:jobId', requireApiKey('ai'), (req, res) => {
        const job = jobs.get(req.params.jobId);

        if (!job) {
            return res.status(404).json({
                status:  false,
                message: 'Job tidak ditemukan atau sudah expired (>1 jam).'
            });
        }

        const elapsed = Math.round((Date.now() - job.createdAt) / 1000) + 's';

        if (job.status === 'done') {
            return res.json({
                status:     true,
                job_id:     req.params.jobId,
                job_status: 'done',
                prompt:     job.prompt,
                elapsed,
                video:      job.video
            });
        }

        if (job.status === 'failed') {
            return res.status(500).json({
                status:     false,
                job_id:     req.params.jobId,
                job_status: 'failed',
                elapsed,
                error:      job.error
            });
        }

        return res.json({
            status:     true,
            job_id:     req.params.jobId,
            job_status: job.status,
            prompt:     job.prompt,
            elapsed,
            message:    job.status === 'queued' ? 'Menunggu diproses...' : 'Sedang generate video...',
            tip:        `Cek lagi 15-30 detik: /ai/sora/status/${req.params.jobId}?apikey=...`
        });
    });
};
