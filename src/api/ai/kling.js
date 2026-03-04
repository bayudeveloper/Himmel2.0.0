const axios = require('axios');
const { requireApiKey } = require('../../lib/apiKeyAuth');

const TEMP_MAIL = 'https://himmel-temp-mail-v155.vercel.app';
const delay = ms => new Promise(r => setTimeout(r, ms));

// ─── Temp Mail ─────────────────────────────────────────────────────────────
async function createEmail() {
    const res = await axios.post(`${TEMP_MAIL}/api/generate`, {}, { timeout: 15000 });
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

            const text    = msgRes.data?.message?.text || '';
            const html    = msgRes.data?.message?.html || '';
            const content = (text + ' ' + html)
                .replace(/<[^>]+>/g, ' ')
                .replace(/&nbsp;/gi, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            // OTP extraction patterns
            const patterns = [
                /verification[- ]code[:\s]+(\d{4,8})/i,
                /your code[:\s]+(\d{4,8})/i,
                /code[:\s]+(\d{4,8})/i,
                /otp[:\s]+(\d{4,8})/i,
                /(\d)\s(\d)\s(\d)\s(\d)\s(\d)\s(\d)/,  // spaced digits
                /\b(\d{6})\b/,
                /\b(\d{4})\b/
            ];

            for (const pat of patterns) {
                const m = content.match(pat);
                if (m) {
                    if (pat.source.includes('\\s(\\d)')) return m.slice(1).join('');
                    return m[1];
                }
            }
        } catch (_) {}
    }
    throw new Error('OTP timeout — kode tidak diterima dalam 2 menit');
}

// ══════════════════════════════════════════════════════════════════════════
// KLING AI
// ══════════════════════════════════════════════════════════════════════════
const KLING_HDR = {
    'User-Agent':      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    'Accept':          'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Content-Type':    'application/json',
    'Origin':          'https://klingai.com',
    'Referer':         'https://klingai.com/'
};

// Step 1 — Minta OTP ke email
async function klingRequestOTP(email) {
    const res = await axios.post('https://klingai.com/api/user/email/send-code',
        { email, type: 1 },  // type 1 = register/login
        { headers: KLING_HDR, timeout: 20000 }
    );
    if (res.data?.code !== 0 && res.data?.code !== 200) {
        throw new Error('Kling kirim OTP gagal: ' + JSON.stringify(res.data));
    }
    return true;
}

// Step 2 — Login dengan OTP
async function klingLoginWithOTP(email, code) {
    const res = await axios.post('https://klingai.com/api/user/email/login',
        { email, code: String(code), type: 1 },
        { headers: KLING_HDR, timeout: 20000 }
    );

    const token = res.data?.data?.token
        || res.data?.data?.access_token
        || res.data?.token;

    if (!token) throw new Error('Kling login gagal: ' + JSON.stringify(res.data).slice(0, 300));
    return token;
}

// Step 3 — Submit generate video
async function klingSubmit(token, prompt, duration, ratio) {
    const res = await axios.post('https://klingai.com/api/works/text2video/submit',
        {
            inputs: [{ inputType: 'text', inputVal: prompt }],
            arguments: [
                { name: 'duration',  value: String(duration) },
                { name: 'ratio',     value: ratio },
                { name: 'quality',   value: 'high' },
                { name: 'cfg',       value: '0.5' }
            ],
            type: 'mmu_txt2video_aiweb'
        },
        {
            headers: { ...KLING_HDR, 'Cookie': `token=${token}` },
            timeout: 30000
        }
    );

    const taskId = res.data?.data?.task?.id;
    if (!taskId) throw new Error('Kling submit gagal: ' + JSON.stringify(res.data).slice(0, 300));
    return taskId;
}

// Step 4 — Poll status
async function klingPollStatus(token, taskId) {
    const start = Date.now();

    while (Date.now() - start < 10 * 60 * 1000) {
        await delay(8000);

        const res = await axios.get(
            `https://klingai.com/api/works/status/${taskId}`,
            {
                headers: { ...KLING_HDR, 'Cookie': `token=${token}` },
                timeout: 20000
            }
        );

        const task  = res.data?.data?.task;
        const works = res.data?.data?.works;
        if (!task) continue;

        // status: 1=pending, 2=processing, 3=success(?), 4=succeed, 5=failed
        const status = task.status;

        if ([3, 4, 'succeed', 'success', 'completed'].includes(status)) {
            const videoUrl =
                works?.[0]?.resource?.resource ||
                works?.[0]?.video_url          ||
                task.video_url                 ||
                works?.[0]?.coverUrl;

            if (videoUrl) return videoUrl;
            throw new Error('Kling selesai tapi URL tidak ditemukan dalam response');
        }

        if ([5, 'failed', 'error'].includes(status)) {
            throw new Error('Kling generation gagal: ' + (task.failMessage || task.fail_message || 'Unknown error'));
        }
    }

    throw new Error('Kling timeout (>10 menit)');
}

// ══════════════════════════════════════════════════════════════════════════
// ENDPOINT
// ══════════════════════════════════════════════════════════════════════════
module.exports = function(app) {
    /**
     * GET /ai/kling?prompt=a cat walking&apikey=M0NPI
     *
     * Query params:
     *   prompt   : deskripsi video (wajib)
     *   duration : 5 / 10 (default: 5 detik)
     *   ratio    : 16:9 / 9:16 / 1:1 (default: 16:9)
     *   apikey   : API key (wajib)
     */
    app.get('/ai/kling', requireApiKey('ai'), async (req, res) => {
        const { prompt, duration = '5', ratio = '16:9' } = req.query;

        if (!prompt) {
            return res.status(400).json({
                status:  false,
                message: "Parameter 'prompt' wajib diisi!",
                contoh:  '/ai/kling?prompt=a cat walking&apikey=M0NPI'
            });
        }

        try {
            // 1. Buat temp email
            const mailData = await createEmail();
            console.log('[kling] email:', mailData.email);

            // 2. Request OTP ke Kling
            await klingRequestOTP(mailData.email);

            // 3. Tunggu OTP masuk ke inbox
            const otp = await waitForOTP(mailData);
            console.log('[kling] otp:', otp);

            // 4. Login
            const token = await klingLoginWithOTP(mailData.email, otp);

            // 5. Submit generate
            const taskId = await klingSubmit(token, prompt, duration, ratio);
            console.log('[kling] taskId:', taskId);

            // 6. Poll sampai selesai
            const videoUrl = await klingPollStatus(token, taskId);

            return res.json({
                status:   true,
                prompt,
                duration: duration + 's',
                ratio,
                video:    videoUrl
            });

        } catch (err) {
            console.error('[kling] error:', err.message);
            return res.status(500).json({
                status: false,
                error:  err.message
            });
        }
    });
};
