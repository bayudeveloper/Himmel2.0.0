const axios = require('axios');

module.exports = (app) => {
    app.get('/downloader/twitter', async (req, res) => {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({
                status: false,
                error: 'Parameter url wajib diisi. Contoh: /downloader/twitter?url=https://x.com/...'
            });
        }

        if (!/twitter\.com|x\.com/.test(url)) {
            return res.status(400).json({
                status: false,
                error: 'Link tidak valid. Gunakan link dari twitter.com atau x.com'
            });
        }

        const match = url.match(/status\/(\d+)/);
        if (!match) {
            return res.status(400).json({
                status: false,
                error: 'Tidak dapat mengambil tweet ID dari URL tersebut.'
            });
        }

        const tweetId = match[1];

        try {
            const { data } = await axios.get(`https://api.vxtwitter.com/Twitter/status/${tweetId}`, {
                timeout: 20000
            });

            if (!data?.media_extended?.length) {
                return res.status(404).json({
                    status: false,
                    error: 'Media tidak ditemukan pada tweet ini.'
                });
            }

            const media = data.media_extended.map((m) => ({
                type: m.type,
                url: m.url,
                thumbnail: m.thumbnail_url || null,
                width: m.size?.width || null,
                height: m.size?.height || null
            }));

            return res.json({
                status: true,
                author: data.user_name || null,
                username: data.user_screen_name || null,
                text: data.text || null,
                likes: data.likes || 0,
                retweets: data.retweets || 0,
                replies: data.replies || 0,
                media
            });

        } catch (err) {
            const status = err?.response?.status;
            if (status === 404) {
                return res.status(404).json({ status: false, error: 'Tweet tidak ditemukan atau sudah dihapus.' });
            }
            return res.status(500).json({ status: false, error: err.message || 'Gagal mengambil data tweet.' });
        }
    });
};
