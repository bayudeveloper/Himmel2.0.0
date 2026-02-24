const axios = require('axios');

module.exports = function(app) {
    const API = {
        base: 'https://embed.dlsrv.online',
        endpoint: {
            info: '/api/info',
            downloadMp4: '/api/download/mp4'
        }
    };

    const HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36',
        'Content-Type': 'application/json'
    };

    function extractId(url) {
        const match = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
        return match ? match[1] : url.length === 11 ? url : null;
    }

    async function request(method, url, data) {
        const response = await axios({ method, url, headers: HEADERS, data });
        return response.data;
    }

    app.get("/downloader/ytmp4", async (req, res) => {
        const { url, quality = '720' } = req.query;

        if (!url) {
            return res.status(400).json({
                status: false,
                message: "Masukkan parameter ?url="
            });
        }

        try {
            const videoId = extractId(url);
            if (!videoId) {
                return res.status(400).json({
                    status: false,
                    message: "URL YouTube tidak valid"
                });
            }

            // Get video info
            const infoUrl = `${API.base}${API.endpoint.info}`;
            const info = await request('POST', infoUrl, { videoId });
            
            if (info.status !== 'info') {
                throw new Error('Gagal mendapatkan info video');
            }

            // Get video formats
            const videoFormats = await Promise.all(
                info.info.formats
                    .filter(f => f.type === 'video')
                    .map(async f => {
                        const dl = await request('POST', `${API.base}${API.endpoint.downloadMp4}`, {
                            videoId,
                            format: f.format,
                            quality: f.quality.replace('p', '')
                        });
                        
                        if (dl.status === 'tunnel') {
                            return {
                                quality: f.quality,
                                format: f.format,
                                fileSize: f.fileSize,
                                url: dl.url,
                                filename: dl.filename,
                                duration: dl.duration
                            };
                        }
                        return null;
                    })
            );

            // Filter berdasarkan quality
            let selectedFormats = videoFormats.filter(Boolean);
            if (quality) {
                const filtered = selectedFormats.filter(f => 
                    f.quality.toLowerCase().includes(quality.toLowerCase())
                );
                if (filtered.length > 0) {
                    selectedFormats = filtered;
                }
            }

            const { title, author, duration, thumbnail } = info.info;

            res.json({
                status: true,
                data: {
                    info: { title, author, duration, thumbnail },
                    formats: selectedFormats,
                    total: selectedFormats.length
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