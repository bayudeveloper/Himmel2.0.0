const axios = require('axios');
const { requireApiKey } = require('../../lib/apiKeyAuth');

// ══════════════════════════════════════════════════════════════════════════
// PROVIDER 1: POLLINATIONS — via POST (lebih stabil dari GET)
// ══════════════════════════════════════════════════════════════════════════
async function pollinationsGenerate(prompt, width, height) {
    const seed = Math.floor(Math.random() * 999999);

    // Coba POST endpoint dulu
    try {
        const res = await axios.post('https://image.pollinations.ai/prompt',
            { prompt, width: parseInt(width), height: parseInt(height), seed, nologo: true, model: 'flux' },
            {
                responseType: 'arraybuffer',
                timeout: 60000,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent':   'Mozilla/5.0',
                    'Referer':      'https://pollinations.ai/'
                }
            }
        );
        if (res.data?.byteLength > 1000) {
            return {
                source: 'Pollinations.ai (Flux)',
                image:  'data:image/jpeg;base64,' + Buffer.from(res.data).toString('base64'),
                url:    null
            };
        }
    } catch (_) {}

    // Fallback GET
    const encoded = encodeURIComponent(prompt);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&seed=${seed}&nologo=true&model=flux`;
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://pollinations.ai/' }
    });
    if (!res.data || res.data.byteLength < 1000) throw new Error('Pollinations return empty');
    return {
        source: 'Pollinations.ai (Flux)',
        image:  'data:image/jpeg;base64,' + Buffer.from(res.data).toString('base64'),
        url
    };
}

// ══════════════════════════════════════════════════════════════════════════
// PROVIDER 2: LEXICA — search existing images, no generation needed
// ══════════════════════════════════════════════════════════════════════════
async function lexicaGenerate(prompt) {
    const res = await axios.get('https://lexica.art/api/v1/search', {
        params:  { q: prompt },
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 15000
    });
    const images = res.data?.images;
    if (!images?.length) throw new Error('Lexica tidak return gambar');
    const img = images[0];
    const url = img.src || img.srcSmall;
    if (!url) throw new Error('Lexica URL tidak ada');
    return { source: 'Lexica.art', image: url, url };
}

// ══════════════════════════════════════════════════════════════════════════
// PROVIDER 3: HUGGING FACE — Inference API anonymous
// ══════════════════════════════════════════════════════════════════════════
async function huggingfaceGenerate(prompt) {
    const models = [
        'stabilityai/stable-diffusion-2-1',
        'runwayml/stable-diffusion-v1-5',
    ];
    for (const model of models) {
        try {
            const res = await axios.post(
                `https://api-inference.huggingface.co/models/${model}`,
                { inputs: prompt },
                {
                    headers: { 'Content-Type': 'application/json' },
                    responseType: 'arraybuffer',
                    timeout: 60000
                }
            );
            if (res.data?.byteLength > 1000) {
                return {
                    source: `Hugging Face (${model.split('/')[1]})`,
                    image:  'data:image/jpeg;base64,' + Buffer.from(res.data).toString('base64'),
                    url:    null
                };
            }
        } catch (_) {}
    }
    throw new Error('Semua HuggingFace model gagal');
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
                contoh:  '/ai/txt2img?prompt=anime girl&apikey=admin123'
            });
        }

        // 1. Lexica dulu (paling cepat, search based)
        try {
            const result = await lexicaGenerate(prompt);
            return res.json({ status: true, prompt, ...result });
        } catch (e1) {
            console.error('[txt2img] Lexica:', e1.message);

            // 2. Pollinations
            try {
                const result = await pollinationsGenerate(prompt, width, height);
                return res.json({ status: true, prompt, ...result });
            } catch (e2) {
                console.error('[txt2img] Pollinations:', e2.message);

                // 3. HuggingFace
                try {
                    const result = await huggingfaceGenerate(prompt);
                    return res.json({ status: true, prompt, ...result });
                } catch (e3) {
                    console.error('[txt2img] HuggingFace:', e3.message);
                    return res.status(500).json({
                        status: false,
                        error: `Lexica: ${e1.message} | Pollinations: ${e2.message} | HuggingFace: ${e3.message}`
                    });
                }
            }
        }
    });
};
