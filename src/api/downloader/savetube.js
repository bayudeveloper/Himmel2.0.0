const axios = require('axios');

module.exports = function(app) {
    const API = {
        base: 'https://embed.dlsrv.online',
        jina: 'https://r.jina.ai/',
        endpoint: {
            info: '/api/info',
            downloadMp4: '/api/download/mp4',
            downloadMp3: '/api/download/mp3',
            full: '/v1/full'
        }
    };

    const HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip, deflate, br, zstd'
    };

    function extractId(url) {
        const match = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
        return match ? match[1] : url.length === 11 ? url : null;
    }

    async function request(method, url, data, customHeaders = {}) {
        try {
            const response = await axios({
                method,
                url,
                headers: { ...HEADERS, ...customHeaders },
                data
            });
            return response.data;
        } catch (err) {
            throw new Error(err.response?.data?.message || err.message);
        }
    }

    async function getDownloadUrl(videoId, type, format, quality) {
        try {
            const endpoint = type === 'video' 
                ? `${API.base}${API.endpoint.downloadMp4}`
                : `${API.base}${API.endpoint.downloadMp3}`;
            
            const res = await request('POST', endpoint, { videoId, format, quality: quality || '' });
            
            if (res.status === 'tunnel') {
                return {
                    url: res.url,
                    filename: res.filename,
                    duration: res.duration
                };
            }
            return null;
        } catch (err) {
            return null;
        }
    }

    async function getMp3Formats(videoId) {
        try {
            const url = `${API.jina}${API.base}${API.endpoint.full}?videoId=${videoId}`;
            const data = await request('GET', url, null, { 'Content-Type': undefined });
            
            const rows = data.match(/\|\s*(\d+kbps)\s*\|\s*mp3\s*\|[^|]+\|/g) || [];
            
            const formats = await Promise.all(rows.map(async row => {
                const quality = row.match(/(\d+kbps)/)?.[1];
                if (!quality) return null;
                
                const dl = await getDownloadUrl(videoId, 'audio', 'mp3', quality.replace('kbps', ''));
                return dl ? {
                    type: 'audio',
                    quality,
                    format: 'mp3',
                    fileSize: null,
                    ...dl
                } : null;
            }));
            
            return formats.filter(Boolean);
        } catch {
            return [];
        }
    }

    app.get("/downloader/savetube", async (req, res) => {
        const { url, format = 'mp4' } = req.query;

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

            // Get all formats
            const videoFormats = await Promise.all(
                info.info.formats
                    .filter(f => f.type === 'video')
                    .map(async f => {
                        const dl = await getDownloadUrl(videoId, 'video', f.format, f.quality.replace('p', ''));
                        return dl ? { ...f, ...dl } : null;
                    })
            );

            const audioFormats = await Promise.all(
                info.info.formats
                    .filter(f => f.type === 'audio' && f.format !== 'mp3')
                    .map(async f => {
                        const dl = await getDownloadUrl(videoId, 'audio', f.format, '');
                        return dl ? { ...f, ...dl } : null;
                    })
            );

            const mp3Formats = await getMp3Formats(videoId);

            const allFormats = [...videoFormats, ...audioFormats, ...mp3Formats].filter(Boolean);

            // Filter berdasarkan format yang diminta
            let filteredFormats = allFormats;
            if (format !== 'all') {
                if (format === 'mp3') {
                    filteredFormats = allFormats.filter(f => f.format === 'mp3');
                } else if (['mp4', 'video'].includes(format)) {
                    filteredFormats = allFormats.filter(f => f.type === 'video');
                } else {
                    filteredFormats = allFormats.filter(f => f.format === format);
                }
            }

            const { title, author, channelId, duration, thumbnail } = info.info;

            res.json({
                status: true,
                data: {
                    info: {
                        title,
                        author,
                        channelId,
                        duration,
                        thumbnail
                    },
                    formats: filteredFormats,
                    total: filteredFormats.length
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