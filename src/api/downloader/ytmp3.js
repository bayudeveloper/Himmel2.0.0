const axios = require('axios');

module.exports = function(app) {
    const API = {
        base: 'https://embed.dlsrv.online',
        jina: 'https://r.jina.ai/',
        endpoint: {
            info: '/api/info',
            downloadMp3: '/api/download/mp3',
            full: '/v1/full'
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

    async function getMp3Formats(videoId) {
        try {
            const url = `${API.jina}${API.base}${API.endpoint.full}?videoId=${videoId}`;
            const data = await request('GET', url);
            
            const rows = data.match(/\|\s*(\d+kbps)\s*\|\s*mp3\s*\|[^|]+\|/g) || [];
            
            const formats = await Promise.all(rows.map(async row => {
                const quality = row.match(/(\d+kbps)/)?.[1];
                if (!quality) return null;
                
                const dl = await request('POST', `${API.base}${API.endpoint.downloadMp3}`, {
                    videoId,
                    format: 'mp3',
                    quality: quality.replace('kbps', '')
                });
                
                if (dl.status === 'tunnel') {
                    return {
                        quality,
                        url: dl.url,
                        filename: dl.filename,
                        duration: dl.duration
                    };
                }
                return null;
            }));
            
            return formats.filter(Boolean);
        } catch {
            return [];
        }
    }

    app.get("/downloader/ytmp3", async (req, res) => {
        const { url } = req.query;

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

            // Get MP3 formats
            const mp3Formats = await getMp3Formats(videoId);

            // Get other audio formats (m4a, opus, etc)
            const otherAudio = await Promise.all(
                info.info.formats
                    .filter(f => f.type === 'audio' && f.format !== 'mp3')
                    .map(async f => {
                        const dl = await request('POST', `${API.base}${API.endpoint.downloadMp3}`, {
                            videoId,
                            format: f.format,
                            quality: ''
                        });
                        
                        if (dl.status === 'tunnel') {
                            return {
                                type: 'audio',
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

            const { title, author, duration, thumbnail } = info.info;

            res.json({
                status: true,
                data: {
                    info: { title, author, duration, thumbnail },
                    formats: {
                        mp3: mp3Formats,
                        other: otherAudio.filter(Boolean)
                    }
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