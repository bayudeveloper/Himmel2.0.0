const axios = require("axios");
const cheerio = require("cheerio");

module.exports = function(app) {
    async function alightScrape(url) {
        try {
            const response = await axios.get(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                    "Referer": "https://alight.link"
                },
                timeout: 15000
            });

            const $ = cheerio.load(response.data);

            const title = $('meta[property="og:title"]').attr("content") || null;
            const description = $('meta[property="og:description"]').attr("content") || null;
            const image = $('meta[property="og:image"]').attr("content") || null;

            return {
                status: true,
                title,
                description,
                image
            };

        } catch (error) {
            return {
                status: false,
                error: "Gagal mengambil data dari URL Alight Motion"
            };
        }
    }

    app.get("/info/alightmotion", async (req, res) => {
        const url = req.query.url;

        if (!url) {
            return res.status(400).json({
                status: false,
                message: "Masukkan parameter ?url="
            });
        }

        try {
            const result = await alightScrape(url);

            if (!result.status) {
                return res.status(500).json(result);
            }

            res.json({
                status: true,
                source: "Alight Motion",
                url: url,
                timestamp: new Date().toISOString(),
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