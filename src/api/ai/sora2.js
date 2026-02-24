/**
 * ╔══════════════════════════════════════════╗
 * ║        Sora2 - Async Queue System        ║
 * ║  Anti-502 | Anti-Timeout | Stable        ║
 * ╚══════════════════════════════════════════╝
 *
 * Cara kerja baru:
 *  POST/GET /ai/sora?prompt=...  → langsung dapat { task_id }
 *  GET /ai/sora/status/:id       → cek status kapanpun
 *
 * User tidak perlu nunggu 7 menit — server tidak timeout.
 */

const axios  = require('axios');
const crypto = require('crypto');
const { requireApiKey } = require('../../lib/apiKeyAuth');

const delay = ms => new Promise(r => setTimeout(r, ms));

// ─── In-memory Job Store ──────────────────────────────────────────────────────
// { taskId: { status, result, error, createdAt, prompt } }
const jobStore = new Map();

// Bersihkan job yang sudah lebih dari 30 menit (cegah memory leak)
setInterval(() => {
    const now = Date.now();
    for (const [id, job] of jobStore.entries()) {
        if (now - job.createdAt > 30 * 60 * 1000) jobStore.delete(id);
    }
}, 10 * 60 * 1000);

// ─── Temp Mail ────────────────────────────────────────────────────────────────
class TempMail {
    constructor() {
        this.baseUrl = 'https://akunlama.com';
        this.recipient = crypto.randomBytes(8).toString('hex').substring(0, 10);
        this.lastCount = 0;
        this.headers = {
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8',
            'referer': 'https://akunlama.com/',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        };
    }
    get email() { return `${this.recipient}@akunlama.com`; }

    async checkInbox() {
        const r = await axios.get(`${this.baseUrl}/api/list`, {
            params: { recipient: this.recipient },
            headers: { ...this.headers, referer: `https://akunlama.com/inbox/${this.recipient}/list` },
            timeout: 12000
        });
        return r.data;
    }

    async getMsgHtml(msg) {
        const r = await axios.get(`${this.baseUrl}/api/getHtml`, {
            params: { region: msg.storage.region, key: msg.storage.key },
            headers: this.headers,
            timeout: 12000
        });
        return r.data;
    }

    extractCode(html) {
        const spaced = html.match(/(\d\s){5}\d/);
        if (spaced) return spaced[0].replace(/\s/g, '');
        const m = html.match(/(\d{6})/);
        return m ? m[1] : null;
    }

    // Nunggu OTP max 90 detik (lebih pendek dari default 120)
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

// ─── Sora2 Core Logic ────────────────────────────────────────────────────────
const baseHeaders = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    'sec-ch-ua': '"Chromium";v="131", "Not_A Brand";v="24"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
    'origin': 'https://www.nanobana.net',
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
    return Object.entries(store).map(([k,v]) => `${k}=${v}`).join('; ');
}

function req(method, url, data, headers, timeout = 20000) {
    return axios({ method, url, data, headers, timeout, validateStatus: () => true });
}

async function runSora(prompt, aspect_ratio, n_frames) {
    const cookies = {};
    const mail = new TempMail();

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
    const loginRes = await req('POST', 'https://www.nanobana.net/api/auth/callback/email-code',
        loginData,
        { ...baseHeaders, 'Content-Type': 'application/x-www-form-urlencoded', 'x-auth-return-redirect': '1', Cookie: cookieString(cookies) },
        20000
    );
    extractCookies(cookies, loginRes);

    await req('GET', 'https://www.nanobana.net/api/auth/session',
        null, { ...baseHeaders, Cookie: cookieString(cookies) }, 15000);
    await req('POST', 'https://www.nanobana.net/api/get-user-info',
        '', { ...baseHeaders, Cookie: cookieString(cookies) }, 15000);

    // 4. Submit generate
    const submitRes = await req('POST',
        'https://www.nanobana.net/api/sora2/text-to-video/generate',
        { prompt, aspect_ratio, n_frames, remove_watermark: true },
        { ...baseHeaders, 'Content-Type': 'application/json', Cookie: cookieString(cookies) },
        30000
    );
    extractCookies(cookies, submitRes);
    const taskId = submitRes.data?.taskId;
    if (!taskId) throw new Error('Gagal mendapatkan Task ID dari server');

    // 5. Polling status (max 8 menit)
    const startPoll = Date.now();
    const MAX_POLL = 8 * 60 * 1000;
    let result;
    do {
        if (Date.now() - startPoll > MAX_POLL) throw new Error('Generate timeout (>8 menit). Coba prompt lebih pendek.');
        await delay(5000);
        const statusRes = await req('GET',
            `https://www.nanobana.net/api/sora2/text-to-video/task/${taskId}?save=1&prompt=${encodeURIComponent(prompt)}`,
            null, { ...baseHeaders, Cookie: cookieString(cookies) }, 20000
        );
        extractCookies(cookies, statusRes);
        result = statusRes.data;
    } while (['processing', 'waiting', 'queued'].includes(result?.status));

    if (['failed','error'].includes(result?.status)) {
        throw new Error(`Generate gagal: ${result.error_message || 'Filtered/Server error'}`);
    }

    let videoUrl = null;
    if (result.resultUrls?.length > 0) videoUrl = result.resultUrls[0];
    else if (result.saved?.length > 0) videoUrl = result.saved[0]?.url;
    if (!videoUrl) throw new Error('Video selesai tapi URL tidak ditemukan');

    return { taskId, video: videoUrl };
}

// ─── Background worker: jalankan job tanpa blok request ──────────────────────
async function processJob(jobId) {
    const job = jobStore.get(jobId);
    if (!job) return;

    try {
        job.status = 'processing';
        const result = await runSora(job.prompt, job.ratio, job.frames);
        job.status = 'done';
        job.result = result;
        job.finishedAt = Date.now();
    } catch (err) {
        job.status = 'failed';
        job.error = err.message;
        job.finishedAt = Date.now();
    }
}

// ─── Endpoint ─────────────────────────────────────────────────────────────────
module.exports = function(app) {
    /**
     * Buat job baru
     * GET /ai/sora?prompt=a cat walking&ratio=landscape&frames=10
     * Response langsung: { job_id, status: "queued", check_url }
     */
    app.get('/ai/sora', requireApiKey('ai'), async (req, res) => {
        const { prompt, ratio = 'landscape', frames = '10' } = req.query;

        if (!prompt) {
            return res.status(400).json({
                status: false,
                message: "Parameter 'prompt' wajib diisi! Contoh: /ai/sora?prompt=a cat walking"
            });
        }

        // Batasi queue: maks 10 job pending sekaligus
        const pendingJobs = [...jobStore.values()].filter(j => ['queued','processing'].includes(j.status));
        if (pendingJobs.length >= 10) {
            return res.status(503).json({
                status: false,
                error: 'server_busy',
                message: 'Server sedang sibuk. Ada terlalu banyak request generate, coba lagi dalam 1-2 menit.',
                pending: pendingJobs.length
            });
        }

        const jobId = crypto.randomBytes(8).toString('hex');
        jobStore.set(jobId, {
            status: 'queued',
            prompt,
            ratio,
            frames,
            result: null,
            error: null,
            createdAt: Date.now(),
            finishedAt: null
        });

        // Jalankan di background — TIDAK blok response
        processJob(jobId).catch(() => {});

        res.json({
            status: true,
            message: 'Job diterima! Cek status dengan job_id di bawah.',
            job_id: jobId,
            prompt,
            ratio,
            frames,
            check_url: `/ai/sora/status/${jobId}`,
            estimated: '2-5 menit'
        });
    });

    /**
     * Cek status job
     * GET /ai/sora/status/:jobId
     */
    app.get('/ai/sora/status/:jobId', requireApiKey('ai'), (req, res) => {
        const { jobId } = req.params;
        const job = jobStore.get(jobId);

        if (!job) {
            return res.status(404).json({
                status: false,
                message: 'Job tidak ditemukan. Mungkin sudah expired (>30 menit) atau ID salah.'
            });
        }

        const elapsed = job.finishedAt
            ? `${Math.round((job.finishedAt - job.createdAt) / 1000)}s`
            : `${Math.round((Date.now() - job.createdAt) / 1000)}s berjalan`;

        if (job.status === 'done') {
            return res.json({
                status: true,
                job_id: jobId,
                job_status: 'done',
                prompt: job.prompt,
                elapsed,
                video: job.result.video,
                task_id: job.result.taskId
            });
        }

        if (job.status === 'failed') {
            return res.status(500).json({
                status: false,
                job_id: jobId,
                job_status: 'failed',
                elapsed,
                error: job.error
            });
        }

        // queued atau processing
        res.json({
            status: true,
            job_id: jobId,
            job_status: job.status,
            prompt: job.prompt,
            elapsed,
            message: job.status === 'queued' ? 'Menunggu giliran...' : 'Sedang diproses...',
            tip: `Cek lagi dalam 15-30 detik di: /ai/sora/status/${jobId}`
        });
    });
};
