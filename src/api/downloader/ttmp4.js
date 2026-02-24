const { cfPost, cfGet } = require('../../lib/cfBypass');

module.exports = function(app) {
    async function tiktokDownload(url) {
        // API utama: tikwm (CF bypass)
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
                    video: data.hdplay ? `https://www.tikwm.com${data.hdplay}` : `https://www.tikwm.com${data.play}`,
                    audio: data.music ? `https://www.tikwm.com${data.music}` : null,
                    cover: data.cover,
                    duration: data.duration,
                    stats: {
                        play: data.play_count,
                        like: data.digg_count,
                        comment: data.comment_count,
                        share: data.share_count
                    }
                };
            }
        } catch (_) {}

        // Fallback: snaptik
        try {
            const pageRes = await cfGet('https://snaptik.app/', { timeout: 20000 });
            const tokenMatch = pageRes.data.match(/name="token"\s+value="([^"]+)"/);
            const token = tokenMatch ? tokenMatch[1] : '';
            const cookies = pageRes.headers['set-cookie']?.map(c => c.split(';')[0]).join('; ') || '';

            const formData2 = new URLSearchParams();
            formData2.append('url', url);
            if (token) formData2.append('token', token);

            const postRes = await cfPost('https://snaptik.app/action.php', formData2.toString(), {
                origin: 'https://snaptik.app',
                referer: 'https://snaptik.app/',
                extra: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Cookie': cookies
                },
                timeout: 25000
            });

            const data = postRes.data;
            if (data && data.downloads) {
                return { title: data.title || 'TikTok Video', video: data.downloads[0]?.url, source: 'snaptik' };
            }
        } catch (_) {}

        throw new Error('Gagal mengunduh video TikTok, coba lagi nanti.');
    }

    app.get('/downloader/ttmp4', async (req, res) => {
        const url = req.query.url;
        if (!url) return res.status(400).json({ status: false, message: 'Masukkan parameter ?url=' });
        try {
            const result = await tiktokDownload(url);
            res.json({ status: true, data: result });
        } catch (err) {
            res.status(500).json({ status: false, error: err.message });
        }
    });
};
