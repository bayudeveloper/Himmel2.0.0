/**
 * ╔══════════════════════════════════════════╗
 * ║         faceswap — AI Face Swap          ║
 * ║  LoveFaceSwap API | Simple URL Mode      ║
 * ╚══════════════════════════════════════════╝
 *
 * Endpoint : GET /ai/faceswap
 * Query    :
 *   foto1  → URL gambar wajah sumber (yang wajahnya mau dipakai)
 *   foto2  → URL gambar target (yang wajahnya mau diganti)
 *   apikey → API key
 *
 * Contoh:
 *   /ai/faceswap?foto1=https://...jpg&foto2=https://...jpg&apikey=M0NPI
 */

const axios    = require('axios');
const FormData = require('form-data');
const { requireApiKey } = require('../../lib/apiKeyAuth');

const BASE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
    'Accept'    : 'application/json',
    'origin'    : 'https://lovefaceswap.com',
    'referer'   : 'https://lovefaceswap.com/'
};

// ── Ambil buffer dari URL ─────────────────────────────────────────────
async function fetchBuffer(url) {
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout     : 20000,
        headers     : { 'User-Agent': BASE_HEADERS['User-Agent'] }
    });
    return Buffer.from(res.data);
}

// ── Buat job faceswap ─────────────────────────────────────────────────
async function createJob(sourceBuffer, targetBuffer) {
    const form = new FormData();

    form.append('source_image', sourceBuffer, {
        filename   : 'source.jpg',
        contentType: 'image/jpeg'
    });
    form.append('target_image', targetBuffer, {
        filename   : 'target.jpg',
        contentType: 'image/jpeg'
    });

    const res = await axios.post(
        'https://api.lovefaceswap.com/api/face-swap/create-poll',
        form,
        {
            headers: { ...form.getHeaders(), ...BASE_HEADERS },
            timeout: 30000
        }
    );

    const taskId = res.data?.data?.task_id;
    if (!taskId) throw new Error('Gagal membuat job: task_id tidak ditemukan');
    return taskId;
}

// ── Cek status job ────────────────────────────────────────────────────
async function checkJob(jobId) {
    const res = await axios.get(
        `https://api.lovefaceswap.com/api/common/get?job_id=${jobId}`,
        {
            headers: BASE_HEADERS,
            timeout: 15000
        }
    );
    return res.data?.data;
}

// ── Endpoint ──────────────────────────────────────────────────────────
module.exports = function(app) {
    app.get('/ai/faceswap', requireApiKey('ai'), async (req, res) => {
        const { foto1, foto2 } = req.query;

        if (!foto1 || !foto2) {
            return res.status(400).json({
                status : false,
                message: "Parameter 'foto1' dan 'foto2' wajib diisi!",
                contoh : '/ai/faceswap?foto1=https://url-foto1.jpg&foto2=https://url-foto2.jpg&apikey=M0NPI'
            });
        }

        try {
            // Ambil buffer kedua gambar secara bersamaan
            const [sourceBuffer, targetBuffer] = await Promise.all([
                fetchBuffer(foto1),
                fetchBuffer(foto2)
            ]);

            // Buat job
            const jobId = await createJob(sourceBuffer, targetBuffer);

            // Polling sampai hasil tersedia
            let result;
            let attempts = 0;
            const MAX_ATTEMPTS = 20; // ~60 detik

            do {
                if (attempts >= MAX_ATTEMPTS) {
                    throw new Error('Timeout: proses faceswap terlalu lama');
                }
                await new Promise(r => setTimeout(r, 3000));
                result = await checkJob(jobId);
                attempts++;
            } while (!result?.image_url || result.image_url.length === 0);

            return res.json({
                status : true,
                message: 'Faceswap berhasil!',
                job_id : jobId,
                image  : result.image_url[0],
                images : result.image_url
            });

        } catch (err) {
            return res.status(500).json({
                status : false,
                message: 'Faceswap gagal',
                error  : err.message
            });
        }
    });
};
