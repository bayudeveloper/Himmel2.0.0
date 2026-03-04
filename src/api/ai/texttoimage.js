const axios = require('axios');
const { requireApiKey } = require('../../lib/apiKeyAuth');

const TEMP_MAIL = 'https://himmel-temp-mail-v155.vercel.app';
const delay = ms => new Promise(r => setTimeout(r, ms));

// ─── Temp Mail ─────────────────────────────────────────────────────────────
async function createEmail() {
    const res = await axios.post(`${TEMP_MAIL}/api/generate`, {}, { timeout: 15000 });
    if (!res.data?.success) throw new Error('Gagal buat temp email');
    return res.data; // { email, token, provider, id }
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

            // Ambil pesan pertama yang masuk
            const msgRes = await axios.get(
                `${TEMP_MAIL}/api/message/${encodeURIComponent(email)}/${messages[0].id}`,
                { params: { token, provider }, timeout: 12000 }
            );

            const text = msgRes.data?.message?.text || '';
            const html = msgRes.data?.message?.html || '';
            const content = text + ' ' + html
                .replace(/<[^>]+>/g, ' ')   // strip HTML tags
                .replace(/&nbsp;/gi, ' ')
                .replace(/\s+/g, ' ');

            // OTP extraction — urut dari paling spesifik
            const patterns = [
                /verification[- ]code[:\s]+(\d{4,8})/i,
                /confirm[a-z\s]+code[:\s]+(\d{4,8})/i,
                /your code[:\s]+(\d{4,8})/i,
                /code[:\s]+(\d{4,8})/i,
                /otp[:\s]+(\d{4,8})/i,
                // Digit spasi digit (kayak nanobana: "9 1 4 8 7 3")
                /(\d)\s(\d)\s(\d)\s(\d)\s(\d)\s(\d)/,
                // 6 digit standalone
                /\b(\d{6})\b/,
                // 4 digit standalone
                /\b(\d{4})\b/
            ];

            for (const pat of patterns) {
                const m = content.match(pat);
                if (m) {
                    // Handle spaced digits
                    if (pat.source.includes('\\s')) {
                        return m.slice(1).join('');
                    }
                    return m[1];
                }
            }
        } catch (_) {}
    }
    throw new Error('OTP timeout — kode tidak diterima dalam 2 menit');
}

// ══════════════════════════════════════════════════════════════════════════
// PROVIDER 1: LEONARDO.AI
// ══════════════════════════════════════════════════════════════════════════
const LEO_HDR = {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept':          'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Content-Type':    'application/json',
    'Origin':          'https://app.leonardo.ai',
    'Referer':         'https://app.leonardo.ai/'
};

async function leonardoFlow(email, prompt, width, height) {
    const pass = 'Hml@' + Math.random().toString(36).slice(2, 8) + 'Zz9!';

    // 1. Signup
    await axios.post('https://app.leonardo.ai/api/auth/signup',
        { email, password: pass },
        { headers: LEO_HDR, timeout: 20000 }
    );

    // 2. Ambil OTP dari email
    // (Leonardo kirim email konfirmasi)
    // Catatan: Leonardo pakai AWS Cognito — OTP 6 digit

    // 3. Confirm email
    // (diisi setelah OTP dapat)
    // Placeholder — perlu test actual endpoint confirm

    // Leonardo REST API (setelah login)
    // POST https://cloud.leonardo.ai/api/rest/v1/generations
    throw new Error('Leonardo signup flow butuh test live endpoint — gunakan ideogram');
}

async function leonardoGenerate(token, prompt, width, height) {
    const genRes = await axios.post('https://cloud.leonardo.ai/api/rest/v1/generations', {
        prompt,
        modelId:        'b24e16ff-06e3-43eb-8d33-4416c2d75876',
        width:          parseInt(width),
        height:         parseInt(height),
        num_images:     1,
        guidance_scale: 7,
        alchemy:        true
    }, {
        headers: { ...LEO_HDR, 'Authorization': `Bearer ${token}` },
        timeout: 30000
    });

    const genId = genRes.data?.sdGenerationJob?.generationId;
    if (!genId) throw new Error('Tidak dapat generation ID');

    // Poll
    const start = Date.now();
    while (Date.now() - start < 5 * 60 * 1000) {
        await delay(3000);
        const st = await axios.get(
            `https://cloud.leonardo.ai/api/rest/v1/generations/${genId}`,
            { headers: { ...LEO_HDR, 'Authorization': `Bearer ${token}` }, timeout: 15000 }
        );
        const gen = st.data?.generations_by_pk;
        if (gen?.status === 'COMPLETE') {
            const url = gen.generated_images?.[0]?.url;
            if (url) return url;
            throw new Error('Complete tapi URL tidak ada');
        }
        if (gen?.status === 'FAILED') throw new Error('Generation FAILED');
    }
    throw new Error('Timeout >5 menit');
}

// ══════════════════════════════════════════════════════════════════════════
// PROVIDER 2: IDEOGRAM.AI (Fallback)
// ══════════════════════════════════════════════════════════════════════════
const IDEO_HDR = {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept':          'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Content-Type':    'application/json',
    'Origin':          'https://ideogram.ai',
    'Referer':         'https://ideogram.ai/'
};

async function ideogramRegister(email) {
    const res = await axios.post('https://ideogram.ai/api/account/create',
        { email, is_age_verified: true },
        { headers: IDEO_HDR, timeout: 20000 }
    );
    if (res.data?.error) throw new Error('Ideogram register error: ' + res.data.error);
    return true;
}

async function ideogramVerify(email, otp) {
    const res = await axios.post('https://ideogram.ai/api/account/verify_otp',
        { email, otp: String(otp) },
        { headers: IDEO_HDR, timeout: 20000 }
    );
    const token = res.data?.jwt || res.data?.token || res.data?.data?.token;
    if (!token) throw new Error('Ideogram verify gagal, response: ' + JSON.stringify(res.data));
    return token;
}

async function ideogramGenerate(token, prompt) {
    const res = await axios.post('https://ideogram.ai/api/images/sample',
        {
            prompt,
            aspect_ratio:  'ASPECT_1_1',
            model_version: 'V_2_TURBO',
            style_type:    'AUTO',
            magic_prompt:  'AUTO',
            num_samples:   1
        },
        {
            headers: { ...IDEO_HDR, 'Authorization': `Bearer ${token}` },
            timeout: 90000
        }
    );
    const url = res.data?.response?.data?.[0]?.url || res.data?.images?.[0]?.url;
    if (!url) throw new Error('Ideogram tidak return URL, response: ' + JSON.stringify(res.data).slice(0, 200));
    return url;
}

// ══════════════════════════════════════════════════════════════════════════
// ENDPOINT
// ══════════════════════════════════════════════════════════════════════════
module.exports = function(app) {
    /**
     * GET /ai/txt2img?prompt=anime girl&apikey=M0NPI
     *
     * Query params:
     *   prompt  : deskripsi gambar (wajib)
     *   width   : 512 / 768 / 1024 (default: 512) — Leonardo only
     *   height  : 512 / 768 / 1024 (default: 512) — Leonardo only
     *   apikey  : API key (wajib)
     */
    app.get('/ai/txt2img', requireApiKey('ai'), async (req, res) => {
        const { prompt, width = '512', height = '512' } = req.query;
        if (!prompt) {
            return res.status(400).json({
                status: false,
                message: "Parameter 'prompt' wajib diisi!",
                contoh: '/ai/txt2img?prompt=anime girl&apikey=M0NPI'
            });
        }

        // ── COBA IDEOGRAM (lebih reliable untuk email flow) ──────────────
        try {
            const mailData = await createEmail();
            await ideogramRegister(mailData.email);
            const otp   = await waitForOTP(mailData);
            const token = await ideogramVerify(mailData.email, otp);
            const url   = await ideogramGenerate(token, prompt);
            return res.json({ status: true, prompt, source: 'Ideogram.ai', image: url });
        } catch (ideoErr) {
            console.error('[txt2img] Ideogram error:', ideoErr.message);

            // ── FALLBACK: LEONARDO ───────────────────────────────────────
            try {
                const mailData = await createEmail();
                // Leonardo butuh token dari login
                // Coba endpoint langsung dengan public API
                const genUrl = await leonardoGenerate('', prompt, width, height);
                return res.json({ status: true, prompt, source: 'Leonardo.ai', image: genUrl });
            } catch (leoErr) {
                console.error('[txt2img] Leonardo error:', leoErr.message);
                return res.status(500).json({
                    status: false,
                    error: `Ideogram: ${ideoErr.message} | Leonardo: ${leoErr.message}`
                });
            }
        }
    });
};
