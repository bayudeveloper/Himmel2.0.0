/**
 * ╔══════════════════════════════════════════╗
 * ║       sora2 — Text to Video              ║
 * ║  nanobana.net | Sora2 | No Login         ║
 * ╚══════════════════════════════════════════╝
 *
 * Endpoint : GET /ai/sora2
 * Query    :
 *   prompt       → deskripsi video yang ingin dibuat
 *   aspect_ratio → landscape | portrait | square (default: landscape)
 *   n_frames     → durasi frame: 10 | 20 | 30 (default: 10)
 *   apikey       → API key
 *
 * Contoh:
 *   /ai/sora2?prompt=a cat playing piano&apikey=
 *   /ai/sora2?prompt=sunset at beach&aspect_ratio=portrait&n_frames=20&apikey=
 */

const axios  = require('axios');
const crypto = require('crypto');
const { requireApiKey } = require('../../lib/apiKeyAuth');

const delay = ms => new Promise(r => setTimeout(r, ms));

const BASE_HEADERS = {
    'User-Agent'        : 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
    'sec-ch-ua'         : '"Chromium";v="139", "Not;A=Brand";v="99"',
    'sec-ch-ua-mobile'  : '?1',
    'sec-ch-ua-platform': '"Android"',
    'Accept-Language'   : 'id-ID,id;q=0.9,en-AU;q=0.8,en;q=0.7,en-US;q=0.6',
    'origin'            : 'https://www.nanobana.net',
    'referer'           : 'https://www.nanobana.net/m/sora2'
};

function extract(cookieStore, res) {
    const setC = res.headers['set-cookie'];
    if (setC) {
        setC.forEach(c => {
            const parts = c.split(';')[0].split('=');
            if (parts.length > 1) cookieStore[parts[0]] = parts.slice(1).join('=');
        });
    }
}

function getkukis(cookieStore) {
    return Object.entries(cookieStore).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function cekmail(name) {
    const res = await axios.get(`https://akunlama.com/api/v1/mail/list?recipient=${name}`);
    if (Array.isArray(res.data) && res.data.length === 0) return `${name}@akunlama.com`;
    throw new Error('Email taken');
}

async function getotp(name) {
    for (let i = 0; i < 20; i++) {
        await delay(3000);
        const res  = await axios.get(`https://akunlama.com/api/v1/mail/list?recipient=${name}`);
        const mails = res.data;
        if (mails.length > 0) {
            for (const m of mails) {
                const match = m.message.headers.subject.match(/Code:\s*(\d{6})/i);
                if (match) return match[1];
            }
        }
    }
    return null;
}

async function sendcode(cookieStore, email) {
    const res = await axios.post('https://www.nanobana.net/api/auth/email/send',
        { email },
        { headers: { ...BASE_HEADERS, 'Content-Type': 'application/json' } }
    );
    extract(cookieStore, res);
}

async function getCsrf(cookieStore) {
    const res = await axios.get('https://www.nanobana.net/api/auth/csrf', {
        headers: { ...BASE_HEADERS, Cookie: getkukis(cookieStore) }
    });
    extract(cookieStore, res);
    return res.data.csrfToken;
}

async function login(cookieStore, email, code, csrfToken) {
    const data = `email=${encodeURIComponent(email)}&code=${code}&redirect=false&csrfToken=${csrfToken}&callbackUrl=${encodeURIComponent('https://www.nanobana.net/m/sora2')}`;
    const res  = await axios.post('https://www.nanobana.net/api/auth/callback/email-code', data, {
        headers: { ...BASE_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded', 'x-auth-return-redirect': '1', Cookie: getkukis(cookieStore) }
    });
    extract(cookieStore, res);
}

async function getsesi(cookieStore) {
    const res = await axios.get('https://www.nanobana.net/api/auth/session', {
        headers: { ...BASE_HEADERS, Cookie: getkukis(cookieStore) }
    });
    extract(cookieStore, res);
}

async function getuserinfo(cookieStore) {
    const res = await axios.post('https://www.nanobana.net/api/get-user-info', '', {
        headers: { ...BASE_HEADERS, Cookie: getkukis(cookieStore) }
    });
    extract(cookieStore, res);
}

async function submitsora(cookieStore, prompt, aspectratio, nFrames) {
    const res = await axios.post('https://www.nanobana.net/api/sora2/text-to-video/generate',
        { prompt, aspect_ratio: aspectratio, n_frames: nFrames, remove_watermark: true },
        { headers: { ...BASE_HEADERS, 'Content-Type': 'application/json', Cookie: getkukis(cookieStore) } }
    );
    extract(cookieStore, res);
    return res.data.taskId;
}

async function cekstatus(cookieStore, taskId, promptText) {
    const url = `https://www.nanobana.net/api/sora2/text-to-video/task/${taskId}?save=1&prompt=${encodeURIComponent(promptText)}`;
    const res = await axios.get(url, {
        headers: { ...BASE_HEADERS, Cookie: getkukis(cookieStore) }
    });
    extract(cookieStore, res);
    return res.data;
}

// ── Endpoint ──────────────────────────────────────────────────────────
module.exports = function(app) {
    app.get('/ai/sora2', requireApiKey('ai'), async (req, res) => {
        const { prompt, aspect_ratio = 'landscape', n_frames = '10' } = req.query;

        if (!prompt) {
            return res.status(400).json({
                status : false,
                message: "Parameter 'prompt' wajib diisi!",
                contoh : '/ai/sora2?prompt=a cat playing piano&apikey=',
                options: {
                    aspect_ratio: ['landscape', 'portrait', 'square'],
                    n_frames    : ['10', '20', '30']
                }
            });
        }

        try {
            const cookieStore = {};
            const randomName  = crypto.randomBytes(6).toString('hex');
            const email       = await cekmail(randomName);

            // 1. Kirim kode OTP
            await sendcode(cookieStore, email);

            // 2. Ambil OTP
            const code = await getotp(randomName);
            if (!code) return res.status(500).json({ status: false, message: 'Timeout mendapatkan OTP.' });

            // 3. Login
            const csrfToken = await getCsrf(cookieStore);
            await login(cookieStore, email, code, csrfToken);
            await getsesi(cookieStore);
            await getuserinfo(cookieStore);

            // 4. Submit job
            const taskId = await submitsora(cookieStore, prompt, aspect_ratio, n_frames);
            if (!taskId) return res.status(500).json({ status: false, message: 'Gagal membuat task.' });

            // 5. Polling hasil
            let result;
            const pendingStatus = ['processing', 'waiting'];
            let attempts = 0;

            do {
                if (attempts >= 60) throw new Error('Timeout: proses video terlalu lama');
                await delay(5000);
                result = await cekstatus(cookieStore, taskId, prompt);
                attempts++;
            } while (pendingStatus.includes(result.status));

            if (result.status === 'failed' || result.status === 'error') {
                return res.status(500).json({
                    status : false,
                    message: `Gagal: ${result.error_message || 'Server error / Filtered'}`
                });
            }

            // 6. Ambil URL video
            let videoUrl = null;
            if (result.resultUrls?.length > 0) {
                videoUrl = result.resultUrls[0];
            } else if (result.saved?.length > 0) {
                videoUrl = result.saved[0].url;
            }

            return res.json({
                status      : true,
                task_id     : taskId,
                prompt,
                aspect_ratio,
                n_frames,
                video       : videoUrl
            });

        } catch (err) {
            return res.status(500).json({
                status : false,
                message: 'Gagal membuat video.',
                error  : err.message
            });
        }
    });
};
