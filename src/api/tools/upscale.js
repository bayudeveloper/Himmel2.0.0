const axios = require('axios');
const FormData = require('form-data');

module.exports = function(app) {

    /**
     * ENDPOINT: GET /tools/upscale?url=https://example.com/image.jpg&multiplier=2
     * Desc: Upscale gambar menggunakan iloveimg.com (gratis, tanpa login)
     *
     * Query Params:
     *   - url        : URL gambar yang mau di-upscale (wajib)
     *   - multiplier : 2 atau 4 (default: 2)
     */
    app.get('/tools/upscale', async (req, res) => {
        const { url, multiplier = '2' } = req.query;

        if (!url) {
            return res.status(400).json({
                status: false,
                message: "Parameter 'url' wajib diisi! Contoh: /tools/upscale?url=https://example.com/image.jpg"
            });
        }

        if (!['2', '4'].includes(multiplier)) {
            return res.status(400).json({
                status: false,
                message: "Parameter 'multiplier' harus 2 atau 4"
            });
        }

        try {
            // Step 1: Ambil token & taskId dari halaman iloveimg
            const pageRes = await axios.get('https://www.iloveimg.com/id/tingkatkan-gambar', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html'
                },
                timeout: 15000
            });

            const html = pageRes.data;
            const token = html.match(/"token":"([^"]+)"/)?.[1];
            const taskId = html.match(/ilovepdfConfig\.taskId\s*=\s*'([^']+)'/)?.[1];

            if (!token || !taskId) {
                throw new Error('Gagal ambil token/taskId dari iloveimg');
            }

            // Step 2: Download gambar dari URL
            const imgRes = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const fileBuffer = Buffer.from(imgRes.data);
            const contentType = imgRes.headers['content-type'] || 'image/jpeg';
            const ext = contentType.split('/')[1]?.split(';')[0] || 'jpg';
            const fileName = `image_${Date.now()}.${ext}`;

            // Step 3: Upload gambar ke iloveimg
            const uploadForm = new FormData();
            uploadForm.append('name', fileName);
            uploadForm.append('chunk', '0');
            uploadForm.append('chunks', '1');
            uploadForm.append('task', taskId);
            uploadForm.append('preview', '1');
            uploadForm.append('pdfinfo', '0');
            uploadForm.append('pdfforms', '0');
            uploadForm.append('pdfresetforms', '0');
            uploadForm.append('v', 'web.0');
            uploadForm.append('file', fileBuffer, { filename: fileName, contentType });

            const uploadRes = await axios.post('https://api1g.iloveimg.com/v1/upload', uploadForm, {
                headers: {
                    ...uploadForm.getHeaders(),
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Authorization': `Bearer ${token}`
                },
                timeout: 30000
            });

            const serverFilename = uploadRes.data.server_filename;
            if (!serverFilename) throw new Error('Upload gagal, server_filename tidak ditemukan');

            // Step 4: Process / upscale gambar
            const processForm = new FormData();
            processForm.append('packaged_filename', 'iloveimg-upscaled');
            processForm.append('multiplier', multiplier);
            processForm.append('task', taskId);
            processForm.append('tool', 'upscaleimage');
            processForm.append('files[0][server_filename]', serverFilename);
            processForm.append('files[0][filename]', fileName);

            const processRes = await axios.post('https://api1g.iloveimg.com/v1/process', processForm, {
                headers: {
                    ...processForm.getHeaders(),
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Authorization': `Bearer ${token}`,
                    'Origin': 'https://www.iloveimg.com'
                },
                timeout: 60000
            });

            const processData = processRes.data;
            if (processData.status !== 'TaskSuccess') {
                throw new Error(`Processing gagal: ${JSON.stringify(processData)}`);
            }

            res.json({
                status: true,
                multiplier: `${multiplier}x`,
                data: {
                    url: `https://api1g.iloveimg.com/v1/download/${taskId}`,
                    filename: processData.download_filename,
                    filesize: processData.output_filesize,
                    extensions: processData.output_extensions,
                    timer: processData.timer
                }
            });

        } catch (err) {
            res.status(500).json({
                status: false,
                error: err.message
            });
        }
    });
};
