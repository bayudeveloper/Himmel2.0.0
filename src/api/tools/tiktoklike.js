/**
 * ╔══════════════════════════════════════════╗
 * ║     freetiktoklike — Free TikTok Likes   ║
 * ║  leofame.com | No Login Required         ║
 * ╚══════════════════════════════════════════╝
 *
 * Endpoint : GET /tools/freetiktoklike
 * Query    :
 *   url    → URL video TikTok
 *   apikey → API key
 *
 * Contoh:
 *   /tools/freetiktoklike?url=https://vt.tiktok.com/xxx&apikey=
 */

const axios  = require('axios');
const { requireApiKey } = require('../../lib/apiKeyAuth');

module.exports = function(app) {
    app.get('/tools/freetiktoklike', requireApiKey('tools'), async (req, res) => {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({
                status : false,
                message: "Parameter 'url' wajib diisi!",
                contoh : '/tools/freetiktoklike?url=https://vt.tiktok.com/xxx&apikey='
            });
        }

        try {
            // 1. Ambil token & cookies dari halaman
            const page = await axios.get('https://leofame.com/free-tiktok-likes', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
                }
            });

            const tokenMatch = page.data.match(/var\s+token\s*=\s*'([^']+)'/);
            if (!tokenMatch) {
                return res.status(500).json({ status: false, message: 'Gagal mengambil token.' });
            }

            const token  = tokenMatch[1];
            const cookies = page.headers['set-cookie']
                .map(v => v.split(';')[0])
                .join('; ');

            // 2. Kirim request likes
            const result = await axios.post(
                'https://leofame.com/free-tiktok-likes?api=1',
                new URLSearchParams({
                    token,
                    timezone_offset: 'Asia/Jakarta',
                    free_link      : url
                }).toString(),
                {
                    headers: {
                        'User-Agent'  : 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Origin'      : 'https://leofame.com',
                        'Referer'     : 'https://leofame.com/free-tiktok-likes',
                        'Cookie'      : cookies
                    }
                }
            );

            return res.json({
                status: true,
                result: result.data
            });

        } catch (err) {
            return res.status(500).json({
                status : false,
                message: 'Gagal mengirim likes.',
                error  : err.message
            });
        }
    });
};
