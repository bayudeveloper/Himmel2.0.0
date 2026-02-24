const { cfGet, cfRequest } = require('../../lib/cfBypass');

module.exports = function(app) {
    function extractId(link) {
        const patterns = [/\/s\/([a-zA-Z0-9_-]+)/, /surl=([a-zA-Z0-9_-]+)/, /\/sharing\/([a-zA-Z0-9_-]+)/];
        for (const pattern of patterns) {
            const match = link.match(pattern);
            if (match) return match[1];
        }
        return null;
    }

    async function teraboxDownload(url) {
        // API 1 - dengan CF bypass
        try {
            const response = await cfGet(
                `https://terabox-dl.phiros.workers.dev/?url=${encodeURIComponent(url)}`,
                { timeout: 30000 }
            );
            if (response.data && response.data.ok) {
                return {
                    filename: response.data.fileName || response.data.name || 'Unknown',
                    size: response.data.size || 'Unknown',
                    type: response.data.mimeType || 'application/octet-stream',
                    thumbnail: response.data.thumb || response.data.thumbnail || null,
                    download: response.data.downloadLink || response.data.dlink || response.data.url,
                    direct: response.data.direct || false
                };
            }
        } catch (_) {}

        // API 2 - alternatif dengan CF bypass
        try {
            const altResponse = await cfGet(
                `https://terabox.hmm203.workers.dev/?url=${encodeURIComponent(url)}`,
                { timeout: 30000 }
            );
            if (altResponse.data && altResponse.data.success) {
                return {
                    filename: altResponse.data.file_name,
                    size: altResponse.data.size,
                    download: altResponse.data.download_url
                };
            }
        } catch (_) {}

        // API 3 - fallback ketiga
        try {
            const res3 = await cfRequest({
                method: 'GET',
                url: `https://api.terabox.app/api/get-info?url=${encodeURIComponent(url)}`,
                timeout: 30000
            });
            if (res3.data?.download_url) {
                return {
                    filename: res3.data.file_name || 'file',
                    size: res3.data.size || 'Unknown',
                    download: res3.data.download_url
                };
            }
        } catch (_) {}

        throw new Error('Semua API Terabox tidak tersedia, coba lagi nanti.');
    }

    app.get('/downloader/terabox', async (req, res) => {
        const url = req.query.url;
        if (!url) return res.status(400).json({ status: false, message: 'Masukkan parameter ?url=' });
        const id = extractId(url);
        if (!id) return res.status(400).json({ status: false, message: 'Link Terabox tidak valid' });
        try {
            const result = await teraboxDownload(url);
            res.json({ status: true, id, data: result });
        } catch (error) {
            res.status(500).json({ status: false, error: error.message });
        }
    });
};
