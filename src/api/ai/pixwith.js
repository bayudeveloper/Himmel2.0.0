/**
 * ╔══════════════════════════════════════════╗
 * ║     pixwith — AI Image to Image          ║
 * ║  pixwith.ai | Multi Model | No Login     ║
 * ╚══════════════════════════════════════════╝
 *
 * Endpoint : GET /ai/pixwith
 * Query    :
 *   url    → URL gambar input
 *   prompt → deskripsi perubahan yang diinginkan
 *   model  → nama model (default: kling01image)
 *   apikey → API key
 *
 * Models tersedia:
 *   nanobanana | kling01image | nanobanana2 | flux2dev | seedream45 | chatgpt15
 *
 * Contoh:
 *   /ai/pixwith?url=https://...jpg&prompt=ubah baju jadi warna ungu&model=nanobanana&apikey=
 */

const axios   = require('axios');
const FormData = require('form-data');
const cheerio = require('cheerio');
const { requireApiKey } = require('../../lib/apiKeyAuth');

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

function gensesi() {
    let s = '';
    for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s + '0';
}

function genmail() {
    let s = '';
    for (let i = 0; i < 12; i++) s += Math.floor(Math.random() * 36).toString(36);
    return s + '@akunlama.com';
}

async function reqotp(email, tempSession) {
    await axios.post('https://api.pixwith.ai/api/user/send_email_code',
        { email },
        { headers: { ...BASE_HEADERS, 'x-session-token': tempSession } }
    );
}

async function cekOtp(username) {
    const res = await axios.get(`https://akunlama.com/api/v1/mail/list?recipient=${username}`);
    if (res.data && res.data.length > 0) {
        const r = await axios.get(`https://akunlama.com/api/v1/mail/getHtml?region=${res.data[0].storage.region}&key=${res.data[0].storage.key}`);
        const $ = cheerio.load(r.data);
        $('script, style').remove();
        const match = $('body').text().replace(/\s+/g, ' ').match(/Verification code:\s*([A-Z0-9]+)/);
        return match ? match[1] : null;
    }
    return null;
}

async function verify(email, code, tempSession) {
    const v = await axios.post('https://api.pixwith.ai/api/user/verify_email_code',
        { email, code },
        { headers: { ...BASE_HEADERS, 'x-session-token': tempSession } }
    );
    const ex = await axios.post('https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=AIzaSyAoRsni0q79r831sDrUjUTynjAEG2ai-EY', {
        token: v.data.data.custom_token,
        returnSecureToken: true
    });
    const l = await axios.post('https://api.pixwith.ai/api/user/get_user',
        { token: ex.data.idToken, ref: '-1' },
        { headers: { ...BASE_HEADERS, 'x-session-token': tempSession } }
    );
    return l.data.data.session_token;
}

async function getpreurl(filename, token) {
    const res = await axios.post('https://api.pixwith.ai/api/chats/pre_url',
        { image_name: filename, content_type: 'image/jpeg' },
        { headers: { ...BASE_HEADERS, 'x-session-token': token } }
    );
    return res.data.data.url;
}

async function uploadToS3(uploadData, buffer, filename) {
    const form = new FormData();
    Object.entries(uploadData.fields).forEach(([k, v]) => form.append(k, v));
    form.append('file', buffer, { filename, contentType: 'image/jpeg' });
    const res = await axios.post(uploadData.url, form, { headers: form.getHeaders() });
    return res.status === 204;
}

async function createItem(imageKey, prompt, token, modelConfig) {
    const res = await axios.post('https://api.pixwith.ai/api/items/create',
        {
            images  : { image1: imageKey },
            prompt,
            options : modelConfig.options,
            model_id: modelConfig.model_id
        },
        { headers: { ...BASE_HEADERS, 'x-session-token': token } }
    );
    return res.data;
}

async function cekjob(token) {
    const res = await axios.post('https://api.pixwith.ai/api/items/history',
        { tool_type: '1', tag: '', page: 0, page_size: 12 },
        { headers: { ...BASE_HEADERS, 'x-session-token': token } }
    );
    return res.data.data.items[0];
}

// ── Endpoint ──────────────────────────────────────────────────────────
module.exports = function(app) {
    app.get('/ai/pixwith', requireApiKey('ai'), async (req, res) => {
        const { url, prompt, model = 'kling01image' } = req.query;

        if (!url || !prompt) {
            return res.status(400).json({
                status : false,
                message: "Parameter 'url' dan 'prompt' wajib diisi!",
                contoh : '/ai/pixwith?url=https://...jpg&prompt=ubah baju jadi warna ungu&model=nanobanana&apikey=',
                models : Object.keys(MODELS)
            });
        }

        const modelConfig = MODELS[model] || MODELS['kling01image'];

        try {
            // 1. Download gambar input
            const imgRes = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
            const buffer = Buffer.from(imgRes.data);
            const filename = 'input.jpg';

            // 2. Generate sesi & email temp
            const tempSession = gensesi();
            const email       = genmail();
            const username    = email.split('@')[0];

            // 3. Request OTP
            await reqotp(email, tempSession);

            // 4. Polling OTP (max 75 detik)
            let otp;
            for (let i = 0; i < 15; i++) {
                await new Promise(r => setTimeout(r, 5000));
                otp = await cekOtp(username);
                if (otp) break;
            }
            if (!otp) return res.status(500).json({ status: false, message: 'Gagal mendapatkan OTP.' });

            // 5. Verifikasi & dapatkan session token
            const sessionToken = await verify(email, otp, tempSession);

            // 6. Upload gambar
            const uploadData = await getpreurl(filename, sessionToken);
            await uploadToS3(uploadData, buffer, filename);

            // 7. Buat job
            await createItem(uploadData.fields.key, prompt, sessionToken, modelConfig);

            // 8. Polling hasil (max ~5 menit)
            let result;
            let attempts = 0;
            do {
                if (attempts >= 60) throw new Error('Timeout: proses terlalu lama');
                await new Promise(r => setTimeout(r, 5000));
                result = await cekjob(sessionToken);
                attempts++;
            } while (!result || result.status !== 2);

            return res.json({
                status : true,
                job_id : result.uid,
                model  : model,
                prompt : result.prompt,
                image  : result.result_urls.find(u => !u.is_input).hd
            });

        } catch (err) {
            return res.status(500).json({
                status : false,
                message: 'Proses pixwith gagal.',
                error  : err.message
            });
        }
    });
};
