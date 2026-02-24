const axios = require("axios");
const cheerio = require("cheerio");

module.exports = function(app) {
    app.get("/tools/fftools", async (req, res) => {
        try {
            const [chars, pets, news] = await Promise.all([
                axios.get('https://ff.garena.com/id/chars/'),
                axios.get('https://ff.garena.com/id/pets/'),
                axios.get('https://ff.garena.com/id/news/')
            ]);

            const $chars = cheerio.load(chars.data);
            const $pets = cheerio.load(pets.data);
            const $news = cheerio.load(news.data);

            const characters = [];
            const petsData = [];
            const newsData = [];

            $chars('.char-box').each((i, el) => {
                const name = $chars(el).find('.char-name').text().trim();
                if (name) characters.push(name);
            });

            $pets('.pet-box').each((i, el) => {
                const name = $pets(el).find('.pet-name').text().trim();
                if (name) petsData.push(name);
            });

            $news('.news-item').each((i, el) => {
                const title = $news(el).find('.news-title').text().trim();
                if (title) newsData.push(title);
            });

            res.json({
                status: true,
                data: {
                    total: {
                        characters: characters.length,
                        pets: petsData.length,
                        news: newsData.length
                    },
                    characters: characters.slice(0, 10),
                    pets: petsData.slice(0, 10),
                    news: newsData.slice(0, 10)
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