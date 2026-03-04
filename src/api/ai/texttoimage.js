const axios = require('axios');
const { requireApiKey } = require('../../lib/apiKeyAuth');

const TEMP_MAIL = 'https://himmel-temp-mail-v155.vercel.app';
const delay = ms => new Promise(r => setTimeout(r, ms));

// ─── Temp Mail — paksa pakai Mail.tm (domain dollicons.com) ──────────────────
async function createEmail() {
    // Minta generate dengan prefix random, Mail.tm provider punya domain lebih trusted
    const res = await axios.post(`${TEMP_MAIL}/api/generate`,
        { email: '' }, // prefix kosong = random, provider chain: mailtm → guerrilla → maildrop
        { timeout: 15000 }
    );
    if (!res.data?.success) throw new Error('Gagal buat temp email');
    // Kalau provider = guerrilla, domain-nya sering di-block — retry sampai dapat mailtm
    if (res.data.provider === 'guerrilla') {
        // Coba lagi sampai 3x
        for (let i = 0; i < 3; i++) {
            await delay(1000);
            const r2 = await axios.post(`${TEMP_MAIL}/api/generate`, { email: '' }, { timeout: 15000 });
            if (r2.data?.success && r2.data.provider !== 'guerrilla') return r2.data;
        }
    }
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

            const text    = msgRes.data?.message?.text || '';
            const html    = msgRes.data?.message?.html || '';
            const content = (text + ' ' + html)
                .replace(/<[^>]+>/g, ' ')
                .replace(/&nbsp;/gi, ' ')
                .replace(/\s+/g, ' ').trim();

            const patterns = [
                /verification[- ]code[:\s]+(\d{4,8})/i,
                /confirm[a-z ]*code[:\s]+(\d{4,8})/i,
                /your code[:\s]+(\d{4,8})/i,
                /enter[a-z ]*code[:\s]+(\d{4,8})/i,
                /code[:\s]+(\d{4,8})/i,
                /otp[:\s]+(\d{4,8})/i,
                /(\d)\s(\d)\s(\d)\s(\d)\s(\d)\s(\d)/,
                /\b(\d{6})\b/,
                /\b(\d{4})\b/
            ];

            for (const pat of patterns) {
                const m = content.match(pat);
                if (!m) continue;
                if (pat.toString().includes('\\s(\\d)\\s')) return m.slice(1).join('');
                return m[1];
            }
        } catch (_) {}
    }
    throw new Error('OTP timeout — kode tidak diterima dalam 2 menit');
}

// ══════════════════════════════════════════════════════════════════════════
// IDEOGRAM.AI
// ══════════════════════════════════════════════════════════════════════════
const IDEO_HDR = {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept':          'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Content-Type':    'application/json',
    'Origin':          'https://ideogram.ai',
    'Referer':         'https://ideogram.ai/'
};

async function ideogramRegister(email) {
    // Endpoint register yang bener (bukan /api/account/create)
    const res = await axios.post('https://ideogram.ai/api/account/magic_link',
        { email },
        { headers: IDEO_HDR, timeout: 20000 }
    );
    if (res.data?.error) throw new Error('Ideogram magic_link error: ' + res.data.error);
    return true;
}

async function ideogramVerifyLink(mailData) {
    // Ideogram kirim magic link (bukan OTP) — ambil URL dari email
    const { email, token, provider } = mailData;
    const start = Date.now();

    while (Date.now() - start < 120000) {
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

            const html = msgRes.data?.message?.html || msgRes.data?.message?.text || '';
            // Cari magic link dari email
            const linkMatch = html.match(/https:\/\/ideogram\.ai\/api\/account\/verify[^\s"'<>]+/i)
                           || html.match(/https:\/\/ideogram\.ai[^\s"'<>]*magic[^\s"'<>]*/i)
                           || html.match(/https:\/\/ideogram\.ai[^\s"'<>]*token=[^\s"'<>]*/i);

            if (linkMatch) {
                // Hit magic link untuk dapat token
                const verifyRes = await axios.get(linkMatch[0], {
                    headers: IDEO_HDR,
                    maxRedirects: 5,
                    timeout: 20000
                });
                const jwt = verifyRes.data?.jwt
                    || verifyRes.data?.token
                    || verifyRes.headers?.['set-cookie']?.find(c => c.includes('token'))?.split('=')[1]?.split(';')[0];

                if (jwt) return jwt;
            }

            // Kalau ada OTP juga coba
            const text = msgRes.data?.message?.text || '';
            const otp  = text.match(/\b(\d{6})\b/)?.[1] || text.match(/\b(\d{4})\b/)?.[1];
            if (otp) {
                const r = await axios.post('https://ideogram.ai/api/account/verify_otp',
                    { email, otp },
                    { headers: IDEO_HDR, timeout: 20000 }
                );
                const t = r.data?.jwt || r.data?.token;
                if (t) return t;
            }
        } catch (_) {}
    }
    throw new Error('Ideogram: link/OTP tidak diterima dalam 2 menit');
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
    if (!url) throw new Error('Ideogram tidak return URL: ' + JSON.stringify(res.data).slice(0, 200));
    return url;
}

// ══════════════════════════════════════════════════════════════════════════
// LEONARDO.AI (Fallback)
// ══════════════════════════════════════════════════════════════════════════
const LEO_HDR = {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept':          'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Content-Type':    'application/json',
    'Origin':          'https://app.leonardo.ai',
    'Referer':         'https://app.leonardo.ai/'
};

async function leonardoRegister(email) {
    const pass = 'Hml@' + Math.random().toString(36).slice(2, 8) + 'Zz9!';
    await axios.post('https://app.leonardo.ai/api/auth/signup',
        { email, password: pass },
        { headers: LEO_HDR, timeout: 20000 }
    );
    return pass;
}

async function leonardoConfirm(email, code, pass) {
    // Confirm Cognito OTP
    const res = await axios.post('https://app.leonardo.ai/api/auth/confirm',
        { email, code, password: pass },
        { headers: LEO_HDR, timeout: 20000 }
    );
    const token = res.data?.token || res.data?.access_token || res.data?.data?.token;
    if (!token) throw new Error('Leonardo confirm gagal: ' + JSON.stringify(res.data).slice(0, 200));
    return token;
}

async function leonardoGenerate(token, prompt, width, height) {
    const genRes = await axios.post('https://cloud.leonardo.ai/api/rest/v1/generations',
        {
            prompt,
            modelId:        'b24e16ff-06e3-43eb-8d33-4416c2d75876',
            width:          parseInt(width),
            height:         parseInt(height),
            num_images:     1,
            guidance_scale: 7,
            alchemy:        true
        },
        { headers: { ...LEO_HDR, 'Authorization': `Bearer ${token}` }, timeout: 30000 }
    );

    const genId = genRes.data?.sdGenerationJob?.generationId;
    if (!genId) throw new Error('Tidak dapat generation ID dari Leonardo');

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
        if (gen?.status === 'FAILED') throw new Error('Leonardo generation FAILED');
    }
    throw new Error('Leonardo timeout >5 menit');
}

// ══════════════════════════════════════════════════════════════════════════
// ENDPOINT
// ══════════════════════════════════════════════════════════════════════════
module.exports = function(app) {
    app.get('/ai/txt2img', requireApiKey('ai'), async (req, res) => {
        const { prompt, width = '512', height = '512' } = req.query;
        if (!prompt) {
            return res.status(400).json({
                status:  false,
                message: "Parameter 'prompt' wajib diisi!",
                contoh:  '/ai/txt2img?prompt=anime girl&apikey=M0NPI'
            });
        }

        // ── IDEOGRAM ──────────────────────────────────────────────────────
        try {
            const mailData = await createEmail();
            console.log('[txt2img] email:', mailData.email, 'provider:', mailData.provider);
            await ideogramRegister(mailData.email);
            const token = await ideogramVerifyLink(mailData);
            const url   = await ideogramGenerate(token, prompt);
            return res.json({ status: true, prompt, source: 'Ideogram.ai', image: url });
        } catch (ideoErr) {
            console.error('[txt2img] Ideogram error:', ideoErr.message);

            // ── FALLBACK: LEONARDO ─────────────────────────────────────────
            try {
                const mailData = await createEmail();
                console.log('[txt2img] leo email:', mailData.email);
                const pass  = await leonardoRegister(mailData.email);
                const otp   = await waitForOTP(mailData);
                const token = await leonardoConfirm(mailData.email, otp, pass);
                const url   = await leonardoGenerate(token, prompt, width, height);
                return res.json({ status: true, prompt, source: 'Leonardo.ai', image: url });
            } catch (leoErr) {
                console.error('[txt2img] Leonardo error:', leoErr.message);
                return res.status(500).json({
                    status: false,
                    error:  `Ideogram: ${ideoErr.message} | Leonardo: ${leoErr.message}`
                });
            }
        }
    });
};
