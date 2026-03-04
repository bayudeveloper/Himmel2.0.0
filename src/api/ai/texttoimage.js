const axios = require('axios');
const { requireApiKey } = require('../../lib/apiKeyAuth');

const delay = ms => new Promise(r => setTimeout(r, ms));

// ══════════════════════════════════════════════════════════════════════════
// PROVIDER 1: POLLINATIONS — beberapa model, fallback antar model
// ══════════════════════════════════════════════════════════════════════════
const POLL_MODELS = ['flux', 'flux-realism', 'flux-anime', 'turbo'];

async function pollinationsGenerate(prompt, width, height) {
    for (const model of POLL_MODELS) {
        try {
            const seed    = Math.floor(Math.random() * 999999);
            const encoded = encodeURIComponent(prompt);
            const url     = `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&seed=${seed}&nologo=true&model=${model}`;

            const res = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout:      60000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer':    'https://pollinations.ai/'
                },
                maxRedirects: 5
            });

            if (res.data && res.data.byteLength > 1000) {
                return {
                    source: `Pollinations.ai (${model})`,
                    image:  'data:image/jpeg;base64,' + Buffer.from(res.data).toString('base64'),
                    url
                };
            }
        } catch (_) {}
    }
    throw new Error('Semua model Pollinations gagal');
}

// ══════════════════════════════════════════════════════════════════════════
// PROVIDER 2: HUGGING FACE — Stable Diffusion via Inference API publik
// ══════════════════════════════════════════════════════════════════════════
async function huggingfaceGenerate(prompt) {
    const models = [
        'stabilityai/stable-diffusion-2-1',
        'runwayml/stable-diffusion-v1-5',
        'CompVis/stable-diffusion-v1-4'
    ];

    for (const model of models) {
        try {
            const res = await axios.post(
                `https://api-inference.huggingface.co/models/${model}`,
                { inputs: prompt },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent':   'Mozilla/5.0'
                        // No Authorization = anonymous/free tier
                    },
                    responseType: 'arraybuffer',
                    timeout:      90000
                }
            );

            if (res.data && res.data.byteLength > 1000) {
                return {
                    source: `Hugging Face (${model.split('/')[1]})`,
                    image:  'data:image/jpeg;base64,' + Buffer.from(res.data).toString('base64'),
                    url:    null
                };
            }
        } catch (_) {}
    }
    throw new Error('Semua model Hugging Face gagal');
}

// ══════════════════════════════════════════════════════════════════════════
// PROVIDER 3: LEXICA.ART — search-based, no key
// ══════════════════════════════════════════════════════════════════════════
async function lexicaGenerate(prompt) {
    const res = await axios.get('https://lexica.art/api/v1/search', {
        params:  { q: prompt },
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 15000
    });
    const images = res.data?.images;
    if (!images?.length) throw new Error('Lexica tidak return gambar');
    // Ambil gambar pertama yang relevan
    const img = images[0];
    return {
        source: 'Lexica.art',
        image:  img.src || img.srcSmall,
        url:    img.src || img.srcSmall
    };
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
     *   width   : lebar (default: 1024)
     *   height  : tinggi (default: 1024)
     *   apikey  : API key (wajib)
     */
    app.get('/ai/txt2img', requireApiKey('ai'), async (req, res) => {
        const { prompt, width = '1024', height = '1024' } = req.query;

        if (!prompt) {
            return res.status(400).json({
                status:  false,
                message: "Parameter 'prompt' wajib diisi!",
                contoh:  '/ai/txt2img?prompt=anime girl&apikey=M0NPI'
            });
        }

        // 1. Pollinations
        try {
            const result = await pollinationsGenerate(prompt, width, height);
            return res.json({ status: true, prompt, ...result });
        } catch (e1) {
            console.error('[txt2img] Pollinations:', e1.message);

            // 2. Hugging Face
            try {
                const result = await huggingfaceGenerate(prompt);
                return res.json({ status: true, prompt, ...result });
            } catch (e2) {
                console.error('[txt2img] HuggingFace:', e2.message);

                // 3. Lexica
                try {
                    const result = await lexicaGenerate(prompt);
                    return res.json({ status: true, prompt, ...result });
                } catch (e3) {
                    console.error('[txt2img] Lexica:', e3.message);
                    return res.status(500).json({
                        status: false,
                        error:  `Pollinations: ${e1.message} | HuggingFace: ${e2.message} | Lexica: ${e3.message}`
                    });
                }
            }
        }
    });
};
