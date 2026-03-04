const axios = require('axios');
const { requireApiKey } = require('../../lib/apiKeyAuth');

const delay = ms => new Promise(r => setTimeout(r, ms));

// ══════════════════════════════════════════════════════════════════════════
// PROVIDER 1: POLLINATIONS.AI — no login, no key
// ══════════════════════════════════════════════════════════════════════════
async function pollinationsGenerate(prompt, width, height) {
    const encoded = encodeURIComponent(prompt);
    const url     = `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&nologo=true&enhance=true&model=flux`;

    // Pollinations langsung return gambar (binary)
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout:      60000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });

    if (!res.data || res.data.byteLength < 1000) throw new Error('Pollinations return gambar kosong');

    const base64 = Buffer.from(res.data).toString('base64');
    return {
        source: 'Pollinations.ai (Flux)',
        image:  `data:image/jpeg;base64,${base64}`,
        url:    url
    };
}

// ══════════════════════════════════════════════════════════════════════════
// PROVIDER 2: HUGGING FACE SPACES — no key
// ══════════════════════════════════════════════════════════════════════════
async function huggingfaceGenerate(prompt) {
    // Stable Diffusion XL via public space
    const spaces = [
        'https://stabilityai-stable-diffusion-xl-base-1-0.hf.space',
        'https://hysts-stable-diffusion-v2-1.hf.space',
        'https://runwayml-stable-diffusion-v1-5.hf.space'
    ];

    for (const space of spaces) {
        try {
            // Step 1: join queue
            const joinRes = await axios.post(`${space}/queue/join`, {
                data:         [prompt, '', 7.5, 512, 512, 50],
                fn_index:     0,
                session_hash: Math.random().toString(36).slice(2)
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 15000
            });

            const hash = joinRes.data?.event_id || joinRes.data?.hash;
            if (!hash) continue;

            // Step 2: poll status
            const start = Date.now();
            while (Date.now() - start < 60000) {
                await delay(3000);
                const dataRes = await axios.get(`${space}/queue/status`, {
                    params:  { event_id: hash },
                    timeout: 10000
                });
                if (dataRes.data?.status === 'COMPLETE') {
                    const imgPath = dataRes.data?.output?.data?.[0];
                    if (imgPath) {
                        // Bisa berupa base64 atau URL
                        if (typeof imgPath === 'string' && imgPath.startsWith('data:')) {
                            return { source: 'Hugging Face (SD)', image: imgPath, url: null };
                        }
                        if (typeof imgPath === 'object' && imgPath.url) {
                            return { source: 'Hugging Face (SD)', image: imgPath.url, url: imgPath.url };
                        }
                    }
                }
                if (dataRes.data?.status === 'FAILED') break;
            }
        } catch (_) {}
    }
    throw new Error('Semua Hugging Face space gagal');
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
     *   model   : flux / sd (default: flux)
     *   apikey  : API key (wajib)
     */
    app.get('/ai/txt2img', requireApiKey('ai'), async (req, res) => {
        const { prompt, width = '1024', height = '1024', model = 'flux' } = req.query;

        if (!prompt) {
            return res.status(400).json({
                status:  false,
                message: "Parameter 'prompt' wajib diisi!",
                contoh:  '/ai/txt2img?prompt=anime girl&apikey=M0NPI'
            });
        }

        // ── POLLINATIONS (utama) ──────────────────────────────────────────
        try {
            const result = await pollinationsGenerate(prompt, width, height);
            return res.json({ status: true, prompt, ...result });
        } catch (polErr) {
            console.error('[txt2img] Pollinations error:', polErr.message);

            // ── HUGGING FACE (fallback) ───────────────────────────────────
            try {
                const result = await huggingfaceGenerate(prompt);
                return res.json({ status: true, prompt, ...result });
            } catch (hfErr) {
                console.error('[txt2img] HuggingFace error:', hfErr.message);
                return res.status(500).json({
                    status: false,
                    error:  `Pollinations: ${polErr.message} | HuggingFace: ${hfErr.message}`
                });
            }
        }
    });
};
