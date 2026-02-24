const axios = require("axios");
const cheerio = require("cheerio");

module.exports = function(app) {
    app.get("/random/hentai", async (req, res) => {
        try {
            // Gunakan API yang lebih stabil
            const response = await axios.get('https://api.waifu.pics/nsfw/waifu', {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            res.json({
                status: true,
                data: {
                    url: response.data.url,
                    source: "waifu.pics"
                }
            });
        } catch (err) {
            // Fallback ke sumber lain
            try {
                const response = await axios.get('https://nekos.life/api/v2/img/hentai', {
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });

                res.json({
                    status: true,
                    data: {
                        url: response.data.url,
                        source: "nekos.life"
                    }
                });
            } catch (err2) {
                res.status(500).json({
                    status: false,
                    error: "Failed to fetch hentai images"
                });
            }
        }
    });
};