const { cfPost, cfGet } = require('../../lib/cfBypass');

module.exports = function(app) {
    async function tiktokMp3(url) {
        // API utama: tikwm
        try {
            const formData = new URLSearchParams();
            formData.append('url', url);
            formData.append('count', '12');
            formData.append('cursor', '0');
            formData.append('web', '1');
            formData.append('hd', '1');

            const response = await cfPost('https://www.tikwm.com/api/', formData.toString(), {
                origin: 'https://www.tikwm.com',
                referer: 'https://www.tikwm.com/',
                extra: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                timeout: 30000
            });

            if (response.data.code === 0) {
                const data = response.data.data;
                return {
                    title: data.title,
                    author: data.author.unique_id,
                    audio: data.music ? `https://www.tikwm.com${data.music}` : null,
                    cover: data.cover,
                    duration: data.duration
                };
            }
        } catch (_) {}

        throw new Error('Gagal mengambil audio TikTok, coba lagi nanti.');
    }

    app.get('/downloader/ttmp3', async (req, res) => {
        const url = req.query.url;
        if (!url) return res.status(400).json({ status: false, message: 'Masukkan parameter ?url=' });
        try {
            const result = await tiktokMp3(url);
            res.json({ status: true, data: result });
        } catch (err) {
            res.status(500).json({ status: false, error: err.message });
        }
    });
};
