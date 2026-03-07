/**
 * ╔══════════════════════════════════════════╗
 * ║     pixwith — AI Image to Image          ║
 * ║  pixwith.ai | Multi Model | No Login     ║
 * ╚══════════════════════════════════════════╝
 *
 * FLOW (2 endpoint karena Vercel timeout):
 *
 *  STEP 1 — POST /ai/pixwith/create
 *    Body: { url, prompt, model }
 *    → Generate email, dapat OTP, upload gambar, buat job
 *    → Return: { status, job_token, job_session }
 *
 *  STEP 2 — GET /ai/pixwith/result?job_token=xxx&job_session=xxx
 *    → Cek status job 1x
 *    → Return: { status, done: true/false, image? }
 *    → Client poll endpoint ini tiap 5 detik sampai done: true
 *
 * Contoh flow client:
 *   1. POST /ai/pixwith/create → dapat job_token + job_session
 *   2. GET  /ai/pixwith/result?job_token=xxx&job_session=xxx
 *      → kalau done: false → tunggu 5 detik, ulang
 *      → kalau done: true  → ambil image URL
 */

const axios    = require('axios');
const FormData = require('form-data');
const cheerio  = require('cheerio');
const { requireApiKey } = require('../../lib/apiKeyAuth');

const HIMMEL = 'https://himmel-temp-mail-v155.vercel.app';

const BASE_HEADERS = {
    'User-Agent'        : 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
    'Content-Type'      : 'application/json',
    'sec-ch-ua'         : '"Chromium";v="139", "Not;A=Brand";v="99"',
    'sec-ch-ua-mobile'  : '?1',
    'sec-ch-ua-platform': '"Android"',
    'origin'            : 'https://pixwith.ai',
    'referer'           : 'https://pixwith.ai/',
    'accept-language'   : 'id-ID,id;q=0.9,en-AU;q=0.8,en;q=0.7,en-US;q=0.6'
};

const MODELS = {
    'kling01image': { model_id: '1-34', options: { prompt_optimization: true, num_outputs: 1, aspect_ratio: 'auto', resolution: '1K' } },
    'nanobanana'  : { model_id: '1-10', options: { prompt_optimization: true, num_outputs: 1, aspect_ratio: '0' } },
    'nanobanana2' : { model_id: '1-23', options: { prompt_optimization: true, num_outputs: 1, aspect_ratio: '0', resolution: '1K' } },
    'flux2dev'    : { model_id: '1-28', options: { prompt_optimization: true, num_outputs: 1, aspect_ratio: '0' } },
    'seedream45'  : { model_id: '1-32', options: { prompt_optimization: true, num_outputs: 1, aspect_ratio: '1:1', resolution: '2K' } },
    'chatgpt15'   : { model_id: '1-37', options: { prompt_optimization: true, num_outputs: 1, aspect_ratio: '1:1', quality: 'low' } }
};

const OTP_BLACKLIST = new Set([
    'PLEASE','THANKS','HELLO','ENTER','START','SHARE','NEVER','OTHERS',
    'STAFF','EMAIL','CONTA','SUPPO','RIGHT','YOURS','USING','WELCO',
    'VALID','FINAL','SIGNI','GENER','VERIF','EXPIR','REQUE','INITI',
    'DISRE','KEEPE','WISHE','THRIL','BOARD','ABOVE','BELOW','PIXWI',
    'SERVI','TEAMS','CODES'
]);

// ── Helpers ───────────────────────────────────────────────────────────────────
function gensesi() {
    let s = '';
    for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s + '0';
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ── OTP Extractor ─────────────────────────────────────────────────────────────
function extractOtp(rawBody, subject = '') {
    // Layer 1: Subject bracket [VWALQV]
    if (subject) {
        const m = subject.match(/\[([A-Z]{4,8})\]/);
        if (m && !OTP_BLACKLIST.has(m[1])) return m[1];
    }

    // Layer 2: Normalize body — html mail.tm bisa array
    let raw = '';
    if (Array.isArray(rawBody))         raw = rawBody.join(' ');
    else if (typeof rawBody === 'string') raw = rawBody;
    if (!raw) return null;

    // Layer 3: HTML → plain text
    let text = raw;
    try {
        const $ = cheerio.load(raw);
        $('script, style, head').remove();
        text = $('body').text();
    } catch { text = raw; }
    text = text.replace(/\s+/g, ' ').trim();

    // Layer 4: Multi-pattern
    const patterns = [
        /[Vv]erification\s+code\s*:\s*([A-Z]{6})\b/,
        /[Vv]erification\s+code\s*:\s*([A-Z0-9]{4,8})\b/,
        /\bcode\s*[:\-]\s*([A-Z]{6})\b/i,
        /\bcode\s*[:\-]\s*([A-Z0-9]{4,8})\b/i,
        /\b(?:OTP|kode)\s*[:\-]\s*([A-Z0-9]{4,8})\b/i,
        /\b([A-Z]{6})\b/g,
        /\b([0-9]{6})\b/,
        /\b([0-9]{4,8})\b/,
    ];

    for (const p of patterns) {
        if (p.flags && p.flags.includes('g')) {
            for (const m of [...text.matchAll(p)]) {
                if (!OTP_BLACKLIST.has(m[1])) return m[1];
            }
        } else {
            const m = text.match(p);
            if (m && !OTP_BLACKLIST.has(m[1])) return m[1];
        }
    }
    return null;
}

// ── Himmel Temp Mail ──────────────────────────────────────────────────────────
async function himmelGenerate() {
    const res = await axios.post(`${HIMMEL}/api/generate`, {}, { timeout: 15000 });
    const d   = res.data;
    if (!d.success) throw new Error(`Himmel generate gagal: ${d.message}`);
    return { email: d.email, token: d.token, provider: d.provider || 'mailtm' };
}

async function himmelInbox(email, token, provider) {
    const res = await axios.get(
        `${HIMMEL}/api/inbox/${encodeURIComponent(email)}`,
        { params: { token, provider }, timeout: 12000 }
    );
    return res.data.success ? (res.data.messages || []) : [];
}

async function himmelGetMessage(email, msgId, token, provider) {
    const res = await axios.get(
        `${HIMMEL}/api/message/${encodeURIComponent(email)}/${msgId}`,
        { params: { token, provider }, timeout: 12000 }
    );
    return res.data.success ? (res.data.message || {}) : {};
}

// ── Poll OTP — max ~50 detik (cocok untuk Vercel 60s limit) ──────────────────
async function pollOtp(email, token, provider) {
    await sleep(6000); // tunggu email masuk dulu

    for (let i = 0; i < 8; i++) {
        try {
            const msgs = await himmelInbox(email, token, provider);
            for (const msg of msgs) {
                const subject = msg.subject || '';

                // Coba subject dulu (cepat)
                const fromSubject = extractOtp('', subject);
                if (fromSubject) return fromSubject;

                // Fetch body lengkap
                if (msg.id) {
                    try {
                        const full    = await himmelGetMessage(email, msg.id, token, provider);
                        const htmlRaw = Array.isArray(full.html) ? full.html.join(' ') : (full.html || '');
                        const otp     = extractOtp(htmlRaw, subject)
                                     || extractOtp(full.text || '', subject)
                                     || extractOtp(msg.intro || '', subject);
                        if (otp) return otp;
                    } catch {
                        const otp = extractOtp(msg.intro || '', subject);
                        if (otp) return otp;
                    }
                }
            }
        } catch { /* lanjut */ }

        if (i < 7) await sleep(5000);
    }
    return null;
}

// ── Pixwith Functions ─────────────────────────────────────────────────────────
async function reqotp(email, tempSession) {
    await axios.post(
        'https://api.pixwith.ai/api/user/send_email_code',
        { email },
        { headers: { ...BASE_HEADERS, 'x-session-token': tempSession } }
    );
}

async function verifyOtp(email, code, tempSession) {
    const v = await axios.post(
        'https://api.pixwith.ai/api/user/verify_email_code',
        { email, code },
        { headers: { ...BASE_HEADERS, 'x-session-token': tempSession } }
    );
    const ex = await axios.post(
        'https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=AIzaSyAoRsni0q79r831sDrUjUTynjAEG2ai-EY',
        { token: v.data.data.custom_token, returnSecureToken: true }
    );
    const l = await axios.post(
        'https://api.pixwith.ai/api/user/get_user',
        { token: ex.data.idToken, ref: '-1' },
        { headers: { ...BASE_HEADERS, 'x-session-token': tempSession } }
    );
    return l.data.data.session_token;
}

async function getpreurl(filename, token) {
    const res = await axios.post(
        'https://api.pixwith.ai/api/chats/pre_url',
        { image_name: filename, content_type: 'image/jpeg' },
        { headers: { ...BASE_HEADERS, 'x-session-token': token } }
    );
    return res.data.data.url;
}

async function uploadToS3(uploadData, buffer, filename) {
    const form = new FormData();
    Object.entries(uploadData.fields).forEach(([k, v]) => form.append(k, v));
    form.append('file', buffer, { filename, contentType: 'image/jpeg' });
    await axios.post(uploadData.url, form, { headers: form.getHeaders() });
}

async function createItem(imageKey, prompt, token, modelConfig) {
    const res = await axios.post(
        'https://api.pixwith.ai/api/items/create',
        { images: { image1: imageKey }, prompt, options: modelConfig.options, model_id: modelConfig.model_id },
        { headers: { ...BASE_HEADERS, 'x-session-token': token } }
    );
    return res.data;
}

async function cekjob(token) {
    const res = await axios.post(
        'https://api.pixwith.ai/api/items/history',
        { tool_type: '1', tag: '', page: 0, page_size: 12 },
        { headers: { ...BASE_HEADERS, 'x-session-token': token } }
    );
    return res.data.data.items[0];
}

// ══════════════════════════════════════════════════════════════════════════════
// ENDPOINT 1 — POST /ai/pixwith/create
// Tugas: generate email → OTP → upload gambar → buat job
// Return: { status, job_session } untuk di-polling di endpoint 2
// ══════════════════════════════════════════════════════════════════════════════
// ENDPOINT 2 — GET /ai/pixwith/result?job_session=xxx
// Tugas: cek status job 1x
// Return: { status, done, image? }
// Client poll ini tiap 5 detik sampai done: true
// ══════════════════════════════════════════════════════════════════════════════

module.exports = function(app) {

    // ── ENDPOINT 1: Create job ────────────────────────────────────────────────
    app.get('/ai/pixwith/create', requireApiKey('ai'), async (req, res) => {
        const { url, prompt, model = 'kling01image' } = req.query;

        if (!url || !prompt) {
            return res.status(400).json({
                status : false,
                message: "Parameter 'url' dan 'prompt' wajib diisi!",
                contoh : '/ai/pixwith/create?url=https://...jpg&prompt=ubah baju jadi warna ungu&model=nanobanana&apikey=',
                models : Object.keys(MODELS)
            });
        }

        const modelConfig = MODELS[model] || MODELS['kling01image'];

        try {
            // 1. Download gambar
            const imgRes   = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
            const buffer   = Buffer.from(imgRes.data);
            const filename = 'input.jpg';

            // 2. Generate email temp
            const tempSession = gensesi();
            const { email, token: hToken, provider } = await himmelGenerate();

            // 3. Kirim OTP
            await reqotp(email, tempSession);

            // 4. Polling OTP (~50 detik max)
            const otp = await pollOtp(email, hToken, provider);
            if (!otp) {
                return res.status(500).json({ status: false, message: 'Gagal dapat OTP. Coba lagi.' });
            }

            // 5. Verifikasi OTP → session token pixwith
            const sessionToken = await verifyOtp(email, otp, tempSession);

            // 6. Upload gambar
            const uploadData = await getpreurl(filename, sessionToken);
            await uploadToS3(uploadData, buffer, filename);

            // 7. Buat job
            await createItem(uploadData.fields.key, prompt, sessionToken, modelConfig);

            // Return session token untuk di-poll di /result
            return res.json({
                status      : true,
                message     : 'Job berhasil dibuat. Poll /ai/pixwith/result?job_session=xxx',
                job_session : sessionToken,
                model       : model,
                prompt      : prompt,
            });

        } catch (err) {
            return res.status(500).json({ status: false, message: 'Gagal buat job.', error: err.message });
        }
    });

    // ── ENDPOINT 2: Poll result ───────────────────────────────────────────────
    app.get('/ai/pixwith/result', requireApiKey('ai'), async (req, res) => {
        const { job_session } = req.query;

        if (!job_session) {
            return res.status(400).json({ status: false, message: "Parameter 'job_session' wajib diisi!" });
        }

        try {
            const item = await cekjob(job_session);

            if (!item) {
                return res.json({ status: true, done: false, message: 'Job belum ada di history.' });
            }

            // status 2 = selesai, status 0/1 = masih proses, status 3 = gagal
            if (item.status === 3) {
                return res.status(500).json({ status: false, done: true, message: 'Job gagal di pixwith.' });
            }

            if (item.status !== 2) {
                return res.json({ status: true, done: false, message: 'Masih proses...', job_status: item.status });
            }

            // Done!
            const imageUrl = item.result_urls.find(u => !u.is_input);
            return res.json({
                status : true,
                done   : true,
                job_id : item.uid,
                image  : imageUrl ? imageUrl.hd : null,
                prompt : item.prompt,
            });

        } catch (err) {
            return res.status(500).json({ status: false, message: 'Gagal cek result.', error: err.message });
        }
    });

    // ── LEGACY: GET /ai/pixwith (backward compat, redirect ke docs) ───────────
    app.get('/ai/pixwith', requireApiKey('ai'), (req, res) => {
        return res.status(400).json({
            status  : false,
            message : 'Endpoint ini sekarang pakai 2 step karena timeout Vercel.',
            step1   : 'GET /ai/pixwith/create?url=...&prompt=...&model=...&apikey=',
            step2   : 'GET /ai/pixwith/result?job_session=xxx&apikey= (poll tiap 5 detik)',
            models  : Object.keys(MODELS),
        });
    });
};
