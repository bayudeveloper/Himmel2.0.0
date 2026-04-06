/**
 * [ Image to Image ]
 *  Endpoint : GET /ai/img2img?url=&prompt=&apikey=
 *
 *  Provider 1 (Primary)  : Dezgo — img2img gratis tanpa login
 *  Provider 2 (Fallback) : DeepAI — free tier image editor
 *  Provider 3 (Fallback) : Picwish / Erase.bg style via imgupscaler
 *
 *  Tidak pakai: uuid (pakai crypto.randomUUID bawaan Node)
 *               magiceraser (rate limit habis, perlu login)
 */

const axios    = require('axios');
const fs       = require('fs');
const path     = require('path');
const os       = require('os');
const crypto   = require('crypto');
const FormData = require('form-data');
const { requireApiKey } = require('../../lib/apiKeyAuth');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Helper: download URL ke buffer ───────────────────────────────────────────
async function downloadBuffer(imageUrl) {
    const res = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 20000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const ct  = res.headers['content-type'] || 'image/jpeg';
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
    return { buffer: Buffer.from(res.data), ext, contentType: ct.split(';')[0].trim() };
}

// ── Helper: download URL ke file temp ────────────────────────────────────────
async function downloadToTemp(imageUrl) {
    const { buffer, ext, contentType } = await downloadBuffer(imageUrl);
    const tmpPath = path.join(os.tmpdir(), `himmel_i2i_${crypto.randomUUID()}.${ext}`);
    fs.writeFileSync(tmpPath, buffer);
    return { tmpPath, ext, buffer, contentType };
}

// ── Provider 1: Dezgo ─────────────────────────────────────────────────────────
// Dezgo punya endpoint img2img gratis dengan stable diffusion
async function dezgoImg2Img(imageUrl, prompt) {
    const { buffer, ext, contentType } = await downloadBuffer(imageUrl);

    const form = new FormData();
    form.append('prompt',       prompt);
    form.append('negative_prompt', 'ugly, blurry, low quality, watermark, text');
    form.append('guidance',     '7.5');
    form.append('strength',     '0.7');
    form.append('steps',        '30');
    form.append('sampler',      'euler_a');
    form.append('model',        'realistic_vision_5');
    form.append('image',        buffer, {
        filename:    `input.${ext}`,
        contentType: contentType,
    });

    const res = await axios.post('https://dezgo.com/text2image-with-image', form, {
        headers: {
            ...form.getHeaders(),
            'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer':         'https://dezgo.com/',
            'Origin':          'https://dezgo.com',
            'X-Dezgo-Key':     '',
        },
        responseType: 'arraybuffer',
        timeout:      60000,
    });

    if (!res.data || res.data.byteLength < 1000) throw new Error('Dezgo: response gambar kosong');

    // Simpan hasil ke temp, return sebagai base64 data URL
    const outBuf = Buffer.from(res.data);
    const b64    = outBuf.toString('base64');
    return `data:image/jpeg;base64,${b64}`;
}

// ── Provider 2: DeepAI ────────────────────────────────────────────────────────
// DeepAI punya free tier image editor dengan quickstart key
async function deepaiImg2Img(imageUrl, prompt) {
    const form = new FormData();
    form.append('image',  imageUrl);
    form.append('text',   prompt);

    const res = await axios.post('https://api.deepai.org/api/image-editor', form, {
        headers: {
            ...form.getHeaders(),
            'api-key': 'quickstart-QUdJIGlzIGF3ZXNvbWU',
        },
        timeout: 60000,
    });

    if (!res.data?.output_url) throw new Error('DeepAI: output_url tidak ada');
    return res.data.output_url;
}

// ── Provider 3: Stable Diffusion via Prodia (gratis, no key) ─────────────────
async function prodiaImg2Img(imageUrl, prompt) {
    // Prodia free API — img2img endpoint
    const createRes = await axios.post('https://api.prodia.com/v1/sd/transform', {
        imageUrl:        imageUrl,
        model:           'realisticVisionV51_v51VAE.safetensors [a0f13c83]',
        prompt:          prompt,
        negative_prompt: 'ugly, blurry, low quality, watermark',
        denoising_strength: 0.7,
        steps:           25,
        cfg_scale:       7,
        seed:            -1,
        sampler:         'DPM++ 2M Karras',
        upscale:         false,
    }, {
        headers: {
            'Content-Type': 'application/json',
            'X-Prodia-Key': 'free',
        },
        timeout: 15000,
    });

    const jobId = createRes.data?.job;
    if (!jobId) throw new Error('Prodia: gagal dapat job ID');

    // Poll sampai selesai (max 20x × 3 detik = 60 detik)
    for (let i = 0; i < 20; i++) {
        await sleep(3000);
        const statusRes = await axios.get(`https://api.prodia.com/v1/job/${jobId}`, {
            headers: { 'X-Prodia-Key': 'free' },
            timeout: 10000,
        });
        const status = statusRes.data?.status;
        if (status === 'succeeded') {
            const imgUrl = statusRes.data?.imageUrl;
            if (!imgUrl) throw new Error('Prodia: imageUrl tidak ada');
            return imgUrl;
        }
        if (status === 'failed') throw new Error('Prodia: job gagal di server');
    }
    throw new Error('Prodia: timeout 60 detik');
}

// ── Provider 4: Segmind via HuggingFace free inference ───────────────────────
async function huggingfaceImg2Img(imageUrl, prompt) {
    const { buffer } = await downloadBuffer(imageUrl);
    const b64input   = buffer.toString('base64');

    const res = await axios.post(
        'https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5',
        {
            inputs: prompt,
            parameters: {
                init_image:          b64input,
                strength:            0.75,
                num_inference_steps: 25,
                guidance_scale:      7.5,
            }
        },
        {
            headers: {
                'Content-Type': 'application/json',
                // Pakai hf_xxx token atau kosongkan — model public bisa jalan tanpa token (lambat)
                'Authorization': '',
            },
            responseType: 'arraybuffer',
            timeout:       90000,
        }
    );

    if (!res.data || res.data.byteLength < 500) throw new Error('HuggingFace: response kosong');
    const b64 = Buffer.from(res.data).toString('base64');
    return `data:image/jpeg;base64,${b64}`;
}

// ── Export route ──────────────────────────────────────────────────────────────
module.exports = function (app) {
    app.get('/ai/img2img', requireApiKey('ai'), async (req, res) => {
        const { url, prompt } = req.query;

        if (!url)    return res.json({ status: false, message: 'Parameter ?url= wajib diisi' });
        if (!prompt) return res.json({ status: false, message: 'Parameter ?prompt= wajib diisi' });

        const providers = [
            { name: 'dezgo',       fn: () => dezgoImg2Img(url, prompt) },
            { name: 'deepai',      fn: () => deepaiImg2Img(url, prompt) },
            { name: 'prodia',      fn: () => prodiaImg2Img(url, prompt) },
        ];

        const errors = [];

        for (const p of providers) {
            try {
                const result = await p.fn();
                return res.json({
                    status:   true,
                    source:   p.name,
                    prompt:   prompt,
                    url:      result,
                });
            } catch (err) {
                console.warn(`[img2img] ${p.name} gagal:`, err.message);
                errors.push(`${p.name}: ${err.message}`);
            }
        }

        return res.json({
            status:  false,
            message: 'Semua provider gagal',
            errors:  errors,
        });
    });
};
