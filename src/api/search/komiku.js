const axios = require("axios");
const cheerio = require("cheerio");

module.exports = function(app) {
    async function searchKomiku(query) {
        try {
            const { data } = await axios.get(`https://data.komiku.id/cari/?post_type=manga&s=${encodeURIComponent(query)}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                }
            });

            const $ = cheerio.load(data);
            const results = [];

            $('.daftar .bge').each((i, el) => {
                const title = $(el).find('h3').text().trim();
                const url = $(el).find('a').attr('href');
                const image = $(el).find('img').attr('src');
                const description = $(el).find('p').text().trim();
                
                const genres = [];
                $(el).find('.genre').each((_, g) => {
                    genres.push($(g).text().trim());
                });

                if (title && url) {
                    results.push({
                        title,
                        url: url.startsWith('http') ? url : `https://komiku.id${url}`,
                        image: image || null,
                        description: description || null,
                        genres: genres.length > 0 ? genres : ['Unknown']
                    });
                }
            });

            return results;
        } catch (err) {
            throw err;
        }
    }

    async function getDetailManga(url) {
        try {
            const { data } = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            const $ = cheerio.load(data);
            
            const title = $('.entry-title').text().trim();
            const description = $('.description').text().trim();
            const cover = $('.img-cover img').attr('src');
            
            const chapters = [];
            $('.daftar-chapter li').each((i, el) => {
                const chapterTitle = $(el).find('a').text().trim();
                const chapterUrl = $(el).find('a').attr('href');
                const date = $(el).find('.date').text().trim();
                
                if (chapterTitle) {
                    chapters.push({
                        title: chapterTitle,
                        url: chapterUrl ? `https://komiku.id${chapterUrl}` : null,
                        date: date || null
                    });
                }
            });

            return {
                title,
                description: description || 'No description',
                cover: cover || null,
                chapters: chapters.slice(0, 20)
            };
        } catch (err) {
            throw err;
        }
    }

    app.get("/search/komiku", async (req, res) => {
        const { q } = req.query;

        if (!q) {
            return res.status(400).json({
                status: false,
                error: "Parameter q required"
            });
        }

        try {
            const results = await searchKomiku(q);
            
            res.json({
                status: true,
                query: q,
                total: results.length,
                data: results
            });
        } catch (error) {
            res.status(500).json({
                status: false,
                error: error.message
            });
        }
    });

    app.get("/search/komiku/detail", async (req, res) => {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({
                status: false,
                error: "Parameter url required"
            });
        }

        try {
            const result = await getDetailManga(url);
            
            res.json({
                status: true,
                data: result
            });
        } catch (error) {
            res.status(500).json({
                status: false,
                error: error.message
            });
        }
    });
};