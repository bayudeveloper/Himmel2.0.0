/**
 * ╔══════════════════════════════════════════╗
 * ║         txt2img — Text to Image          ║
 * ║  3 API fallback | No Login | Stable      ║
 * ╚══════════════════════════════════════════╝
 *
 * Source priority:
 *  1. Pollinations.ai  — gratis, no auth, cepat
 *  2. Lexica.art       — search gambar dari prompt
 *  3. Picsum (dummy)   — fallback terakhir
 */

const axios = require('axios');
const { requireApiKey } = require('../../lib/apiKeyAuth');
const { cfGet } = require('../../lib/cfBypass');

// ── 1. Pollinations.ai ────────────────────────────────────────────────
// Gratis, no auth, langsung return image URL
async function generatePollinations(prompt, width = 1024, height = 1024, model = 'flux') {
    const encoded = encodeURIComponent(prompt);
    const seed = Math.floor(Math.random() * 999999);

    // Coba beberapa model
    const models = [model, 'flux', 'flux-realism', 'turbo'];

    for (const m of models) {
        try {
            const url = `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&seed=${seed}&model=${m}&nologo=true&enhance=true`;

            // HEAD request dulu buat cek valid
            const check = await axios.head(url, { timeout: 20000 });
            if (check.status === 200) {
                return {
                    url,
                    model: m,
                    width,
                    height,
                    seed
                };
            }
        } catch { continue; }
    }
    throw new Error('Pollinations: semua model gagal');
}

// ── 2. Lexica.art ─────────────────────────────────────────────────────
// Search gambar AI dari database Lexica
async function generateLexica(prompt) {
    const res = await cfGet(
        `https://lexica.art/api/v1/search?q=${encodeURIComponent(prompt)}`,
        { timeout: 15000 }
    );

    const images = res.data?.images;
    if (!images || images.length === 0) throw new Error('Lexica: tidak ada hasil');

    // Ambil 4 gambar teratas
    const top = images.slice(0, 4);
    return top.map(img => ({
        url: img.src || img.srcSmall,
        width: img.width,
        height: img.height,
        prompt: img.prompt
    }));
}

// ── 3. Stable Diffusion via hf.space ─────────────────────────────────
async function generateHuggingFace(prompt) {
    // Gradio API dari Hugging Face Space (publik)
    const res = await axios.post(
        'https://stabilityai-stable-diffusion-3-medium.hf.space/run/predict',
        {
            data: [
                prompt,                    // prompt
                '',                        // negative prompt
                0,                         // seed (0 = random)
                true,                      // randomize seed
                1024, 1024,               // width, height
                4.5,                       // guidance scale
                28,                        // steps
                '2x_jpg'                   // output format
            ]
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            },
            timeout: 60000
        }
    );

    const output = res.data?.data;
    if (!output || !output[0]) throw new Error('HuggingFace: tidak ada output');

    // Output bisa berupa base64 atau URL
    const imgData = output[0];
    if (typeof imgData === 'string' && imgData.startsWith('data:image')) {
        return { base64: imgData, type: 'base64' };
    }
    if (typeof imgData === 'string' && imgData.startsWith('http')) {
        return { url: imgData, type: 'url' };
    }
    if (imgData?.url) {
        return { url: imgData.url, type: 'url' };
    }
    throw new Error('HuggingFace: format response tidak dikenal');
}

// ── Endpoint ──────────────────────────────────────────────────────────
module.exports = function(app) {
    /**
     * GET /ai/txt2img
     * Query:
     *   - prompt  : deskripsi gambar (wajib)
     *   - width   : lebar gambar (default: 1024)
     *   - height  : tinggi gambar (default: 1024)
     *   - model   : flux | flux-realism | turbo (default: flux)
     *   - source  : pollinations | lexica | hf | auto (default: auto)
     *   - apikey  : API key (wajib)
     *
     * Contoh:
     *   /ai/txt2img?prompt=a cat in space&apikey=M0NPI
     *   /ai/txt2img?prompt=anime girl&model=flux-realism&apikey=M0NPI
     *   /ai/txt2img?prompt=landscape&source=lexica&apikey=M0NPI
     */
    app.get('/ai/txt2img', requireApiKey('ai'), async (req, res) => {
        const {
            prompt,
            width  = '1024',
            height = '1024',
            model  = 'flux',
            source = 'auto'
        } = req.query;

        if (!prompt) {
            return res.status(400).json({
                status: false,
                message: "Parameter 'prompt' wajib diisi!",
                contoh: '/ai/txt2img?prompt=beautiful sunset&apikey=M0NPI'
            });
        }

        const w = Math.min(Math.max(parseInt(width)  || 1024, 256), 1536);
        const h = Math.min(Math.max(parseInt(height) || 1024, 256), 1536);

        // ── Source: Pollinations (default & paling stabil) ──
        if (source === 'pollinations' || source === 'auto') {
            try {
                const result = await generatePollinations(prompt, w, h, model);
                return res.json({
                    status: true,
                    source: 'pollinations',
                    prompt,
                    model: result.model,
                    width: result.width,
                    height: result.height,
                    seed: result.seed,
                    image: result.url,
                    images: [result.url]
                });
            } catch (e) {
                if (source === 'pollinations') {
                    return res.status(500).json({ status: false, error: e.message });
                }
                // auto mode: lanjut ke fallback
            }
        }

        // ── Source: Lexica ──
        if (source === 'lexica' || source === 'auto') {
            try {
                const results = await generateLexica(prompt);
                return res.json({
                    status: true,
                    source: 'lexica',
                    prompt,
                    total: results.length,
                    images: results.map(r => r.url),
                    data: results
                });
            } catch (e) {
                if (source === 'lexica') {
                    return res.status(500).json({ status: false, error: e.message });
                }
            }
        }

        // ── Source: HuggingFace ──
        if (source === 'hf' || source === 'auto') {
            try {
                const result = await generateHuggingFace(prompt);
                return res.json({
                    status: true,
                    source: 'huggingface',
                    prompt,
                    type: result.type,
                    image: result.url || null,
                    base64: result.base64 || null,
                    images: result.url ? [result.url] : []
                });
            } catch (e) {
                return res.status(500).json({
                    status: false,
                    error: `Semua source gagal. Last error: ${e.message}`
                });
            }
        }

        return res.status(400).json({
            status: false,
            error: `Source '${source}' tidak dikenal. Gunakan: pollinations, lexica, hf, atau auto`
        });
    });
};
