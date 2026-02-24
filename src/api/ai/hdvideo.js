/**
 * ╔══════════════════════════════════════════╗
 * ║       hdvideo — AI Video Enhancer        ║
 * ║  unblurimage.ai | Upscale to 2K          ║
 * ╚══════════════════════════════════════════╝
 *
 * Endpoint : GET /ai/hdvideo
 * Query    :
 *   url    → URL video yang ingin di-enhance
 *   apikey → API key
 *
 * Contoh:
 *   /ai/hdvideo?url=https://example.com/video.mp4&apikey=
 */

const axios    = require('axios');
const FormData = require('form-data');
const crypto   = require('crypto');
const { requireApiKey } = require('../../lib/apiKeyAuth');

const UA     = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SERIAL = crypto.createHash('md5').update(UA + Date.now()).digest('hex');

const baseHeaders = (extra = {}) => Object.assign({
    'accept'        : '*/*',
    'product-serial': SERIAL,
    'user-agent'    : UA,
    'Referer'       : 'https://unblurimage.ai/'
}, extra);

module.exports = function(app) {
    app.get('/ai/hdvideo', requireApiKey('ai'), async (req, res) => {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({
                status : false,
                message: "Parameter 'url' wajib diisi!",
                contoh : '/ai/hdvideo?url=https://example.com/video.mp4&apikey='
            });
        }

        try {
            // 1. Download video
            const videoRes = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout     : 60000,
                headers     : { 'User-Agent': UA }
            });
            const videoBuffer = Buffer.from(videoRes.data);

            // 2. Register file
            const fileName = crypto.randomBytes(3).toString('hex') + '_video.mp4';
            const formReg  = new FormData();
            formReg.append('video_file_name', fileName);

            const reg = await axios.post(
                'https://api.unblurimage.ai/api/upscaler/v1/ai-video-enhancer/upload-video',
                formReg,
                { headers: Object.assign(baseHeaders(), formReg.getHeaders()) }
            );

            const { url: ossUrl, object_name: objectName } = reg.data.result;

            // 3. Upload ke OSS
            await axios.put(ossUrl, videoBuffer, {
                headers : { 'Content-Type': 'video/mp4', 'User-Agent': UA },
                timeout : 120000,
                maxBodyLength: Infinity
            });

            // 4. Create job
            const formJob = new FormData();
            formJob.append('original_video_file', `https://cdn.unblurimage.ai/${objectName}`);
            formJob.append('resolution', '2k');
            formJob.append('is_preview', 'false');

            const create = await axios.post(
                'https://api.unblurimage.ai/api/upscaler/v2/ai-video-enhancer/create-job',
                formJob,
                { headers: Object.assign(baseHeaders(), formJob.getHeaders()) }
            );

            const jobId = create.data.result?.job_id;
            if (!jobId) {
                return res.status(500).json({ status: false, message: 'Gagal membuat job pemrosesan.' });
            }

            // 5. Polling hasil (max 5 menit)
            let outputUrl = null;
            for (let i = 0; i < 60; i++) {
                await new Promise(r => setTimeout(r, 5000));
                const check = await axios.get(
                    `https://api.unblurimage.ai/api/upscaler/v2/ai-video-enhancer/get-job/${jobId}`,
                    { headers: baseHeaders() }
                );
                if (check.data.result?.output_url) {
                    outputUrl = check.data.result.output_url;
                    break;
                }
            }

            if (!outputUrl) {
                return res.status(500).json({ status: false, message: 'Proses timeout atau gagal.' });
            }

            return res.json({
                status : true,
                message: 'Video berhasil di-enhance!',
                job_id : jobId,
                result : outputUrl
            });

        } catch (err) {
            return res.status(500).json({
                status : false,
                message: 'Terjadi kesalahan saat memproses video.',
                error  : err.message
            });
        }
    });
};
