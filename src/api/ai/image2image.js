/**
 * [ Image to Image ]
 *  Base    : https://imgupscaler.ai + magiceraser.org
 *  Endpoint: GET /ai/img2img?url=&prompt=&apikey=
 *  Note    : Tidak pakai package uuid — pakai crypto.randomUUID() bawaan Node.js
 */

const axios    = require('axios');
const fs       = require('fs');
const path     = require('path');
const os       = require('os');
const crypto   = require('crypto');
const FormData = require('form-data');
const { requireApiKey } = require('../../lib/apiKeyAuth');

const MIME = {
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    png:  'image/png',
    webp: 'image/webp',
};

const hdrs = {
    'User-Agent':         'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
    'Accept':             '*/*',
    'Accept-Language':    'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Origin':             'https://imgupscaler.ai',
    'Referer':            'https://imgupscaler.ai/',
    'sec-ch-ua':          '"Chromium";v="137", "Not/A)Brand";v="24"',
    'sec-ch-ua-mobile':   '?0',
    'sec-ch-ua-platform': '"Linux"',
    'sec-fetch-dest':     'empty',
    'sec-fetch-mode':     'cors',
};

const upscalerApi = axios.create({ baseURL: 'https://api.imgupscaler.ai' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1. Download gambar dari URL ke file temp ──────────────────────────────────
async function downloadImage(imageUrl) {
    const res = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 20000 });
    const ct  = res.headers['content-type'] || 'image/jpeg';
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
    const tmpPath = path.join(os.tmpdir(), `himmel_i2i_${crypto.randomUUID()}.${ext}`);
    fs.writeFileSync(tmpPath, Buffer.from(res.data));
    return { tmpPath, ext };
}

// ── 2. Upload ke imgupscaler, return signed URL ───────────────────────────────
async function uploadImage(filePath, ext) {
    // Step 1: Minta upload slot
    const form1 = new FormData();
    form1.append('file_name', `${crypto.randomUUID()}.${ext}`);

    const { data: reg } = await upscalerApi.post('/api/common/upload/upload-image', form1, {
        headers: { ...hdrs, ...form1.getHeaders(), 'sec-fetch-site': 'same-site' },
    });
    const { url: uploadUrl, object_name } = reg.result;

    // Step 2: PUT file ke S3
    await axios.put(uploadUrl, fs.readFileSync(filePath), {
        headers: { 'Content-Type': MIME[ext] || `image/${ext}` },
    });

    // Step 3: Sign object
    const form2 = new FormData();
    form2.append('object_name', object_name);

    const { data: signed } = await upscalerApi.post('/api/common/upload/sign-object', form2, {
        headers: { ...hdrs, ...form2.getHeaders(), 'sec-fetch-site': 'same-site' },
    });

    return signed.result.url;
}

// ── 3. Buat job editing di magiceraser ───────────────────────────────────────
async function createJob(imageUrl, prompt) {
    const form = new FormData();
    form.append('model_name',         'magiceraser_v4');
    form.append('prompt',             prompt);
    form.append('ratio',              'match_input_image');
    form.append('output_format',      'jpg');
    form.append('original_image_url', imageUrl);

    const { data } = await axios.post(
        'https://api.magiceraser.org/api/magiceraser/v2/image-editor/create-job',
        form,
        {
            headers: {
                ...hdrs,
                ...form.getHeaders(),
                'authorization':  '',
                'product-code':   'magiceraser',
                'product-serial': 'f794edea-0ec9-4008-a02c-f3a8de99f150',
                'timezone':       'Asia/Jakarta',
                'sec-fetch-site': 'cross-site',
            },
        }
    );

    if (!data?.result?.job_id) throw new Error('Gagal membuat job: ' + JSON.stringify(data));
    return data.result.job_id;
}

// ── 4. Poll job sampai selesai ────────────────────────────────────────────────
async function pollJob(jobId, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
        await sleep(3000);
        const { data } = await axios.get(
            `https://api.magiceraser.org/api/magiceraser/v1/ai-remove/get-job/${jobId}`,
            { timeout: 10000 }
        );
        if (data.code === 100000 && data.result?.output_url) {
            return data.result;
        }
    }
    throw new Error('Timeout: hasil tidak tersedia setelah 90 detik');
}

// ── Export route ──────────────────────────────────────────────────────────────
module.exports = function (app) {
    app.get('/ai/img2img', requireApiKey('ai'), async (req, res) => {
        const { url, prompt } = req.query;

        if (!url)    return res.json({ status: false, message: 'Parameter ?url= wajib diisi' });
        if (!prompt) return res.json({ status: false, message: 'Parameter ?prompt= wajib diisi' });

        let tmpPath = null;

        try {
            const { tmpPath: tp, ext } = await downloadImage(url);
            tmpPath = tp;

            const signedUrl = await uploadImage(tmpPath, ext);
            const jobId     = await createJob(signedUrl, prompt);
            const result    = await pollJob(jobId);

            return res.json({
                status: true,
                result: {
                    output_url: result.output_url,
                    job_id:     jobId,
                },
            });
        } catch (err) {
            return res.json({
                status:  false,
                message: err.message || 'Terjadi kesalahan',
            });
        } finally {
            if (tmpPath && fs.existsSync(tmpPath)) {
                try { fs.unlinkSync(tmpPath); } catch (_) {}
            }
        }
    });
};
