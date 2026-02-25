/**
 * ╔══════════════════════════════════════════╗
 * ║     notegpt — AI Answer Generator        ║
 * ║  notegpt.io | Image + Prompt | Gemini    ║
 * ╚══════════════════════════════════════════╝
 *
 * Endpoint : GET /ai/notegpt
 * Query    :
 *   url    → URL gambar input
 *   prompt → pertanyaan tentang gambar (default: "whats it is?")
 *   apikey → API key
 *
 * Contoh:
 *   /ai/notegpt?url=https://...jpg&prompt=jelaskan gambar ini&apikey=
 */

const axios   = require('axios');
const FormData = require('form-data');
const crypto  = require('crypto');
const { requireApiKey } = require('../../lib/apiKeyAuth');

const COOKIE = '_gid=GA1.2.49691950.1772022781; anonymous_user_id=9b6fcdfb-7b17-4154-b56a-80f7f9092a0a; sbox-guid=MTc3MjAyMjc4M3wzMTZ8OTIwMDQwMDY4; _ga_PFX3BRW5RQ=GS2.1.s1772022777$o1$g1$t1772023460$j60$l0$h1237640933; _ga=GA1.2.992645210.1772022778';

async function uploadToCatbox(buffer, filename = 'image.jpg') {
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', buffer, { filename, contentType: 'image/jpeg' });

    const res = await axios.post('https://catbox.moe/user/api.php', form, {
        headers: form.getHeaders(),
        timeout: 30000
    });
    return res.data.trim();
}

module.exports = function(app) {
    app.get('/ai/notegpt', requireApiKey('ai'), async (req, res) => {
        const { url, prompt = 'whats it is?' } = req.query;

        if (!url) {
            return res.status(400).json({
                status : false,
                message: "Parameter 'url' wajib diisi!",
                contoh : '/ai/notegpt?url=https://...jpg&prompt=jelaskan gambar ini&apikey='
            });
        }

        try {
            // 1. Download gambar
            const imgRes = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
            const buffer = Buffer.from(imgRes.data);

            // 2. Upload ke catbox
            const imageUrl = await uploadToCatbox(buffer);

            // 3. Kirim ke notegpt
            const payload = {
                message        : prompt,
                language       : 'auto',
                model          : 'gemini-3-flash-preview',
                tone           : 'default',
                length         : 'moderate',
                conversation_id: crypto.randomUUID(),
                image_urls     : [imageUrl],
                stream_url     : '/api/v2/homework/stream'
            };

            const stream = await axios.post(
                'https://notegpt.io/api/v2/homework/stream',
                payload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Origin'      : 'https://notegpt.io',
                        'Referer'     : 'https://notegpt.io/ai-answer-generator',
                        'User-Agent'  : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
                        'Cookie'      : COOKIE
                    },
                    timeout     : 60000,
                    responseType: 'stream'
                }
            );

            // 4. Baca stream
            let fullText = '';
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Stream timeout')), 60000);

                stream.data.on('data', (chunk) => {
                    for (const line of chunk.toString().split('\n')) {
                        if (!line.startsWith('data: ')) continue;
                        try {
                            const jsonStr = line.slice(6);
                            if (!jsonStr) continue;
                            const data = JSON.parse(jsonStr);
                            if (data.text) fullText += data.text;
                            if (data.done) { clearTimeout(timer); resolve(); }
                        } catch {}
                    }
                });

                stream.data.on('error', (err) => { clearTimeout(timer); reject(err); });
                stream.data.on('end',   ()    => { clearTimeout(timer); resolve(); });
            });

            if (!fullText) return res.status(500).json({ status: false, message: 'Tidak ada hasil dari stream.' });

            return res.json({
                status: true,
                prompt,
                result: fullText
            });

        } catch (err) {
            return res.status(500).json({
                status : false,
                message: 'Gagal memproses permintaan.',
                error  : err.message
            });
        }
    });
};
