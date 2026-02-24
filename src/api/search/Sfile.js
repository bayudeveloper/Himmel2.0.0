const axios = require('axios');
const cheerio = require('cheerio');

module.exports = function(app) {

    /**
     * ENDPOINT: GET /search/sfile?q=naruto&page=1
     * Desc: Search file di sfile.co
     */
    app.get('/search/sfile', async (req, res) => {
        const { q, page = '1' } = req.query;

        if (!q) {
            return res.status(400).json({
                status: false,
                message: "Parameter 'q' wajib diisi! Contoh: /search/sfile?q=naruto"
            });
        }

        try {
            const response = await axios.get(`https://sfile.co/search.php?q=${encodeURIComponent(q)}&page=${page}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': 'https://sfile.co'
                },
                timeout: 15000
            });

            const $ = cheerio.load(response.data);
            const result = [];

            $('.group.px-2').each((_, el) => {
                const title = $(el).find('.min-w-0 a').text().trim();
                const link = $(el).find('a').attr('href');
                const elm = $(el).find('.mt-1').text().split('•');

                if (link) result.push({
                    title,
                    size: elm[0]?.trim(),
                    upload_at: elm[1]?.trim(),
                    link
                });
            });

            if (!result || result.length === 0) {
                return res.status(404).json({
                    status: false,
                    message: `Tidak ada hasil untuk "${q}"`
                });
            }

            res.json({
                status: true,
                query: q,
                page: parseInt(page),
                total: result.length,
                data: result
            });

        } catch (err) {
            res.status(500).json({
                status: false,
                error: err.message
            });
        }
    });
};
