const axios = require('axios');
const cheerio = require('cheerio');

module.exports = function(app) {

    const createHeaders = (referer) => ({
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="137", "Google Chrome";v="137"',
        'dnt': '1',
        'sec-ch-ua-mobile': '?1',
        'sec-ch-ua-platform': '"Android"',
        'sec-fetch-site': 'same-origin',
        'sec-fetch-mode': 'cors',
        'sec-fetch-dest': 'empty',
        'Referer': referer,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
    });

    const extractCookies = (headers) => {
        const raw = headers['set-cookie'];
        if (!raw) return '';
        if (Array.isArray(raw)) return raw.map(c => c.split(';')[0]).join('; ');
        return raw.split(',').map(c => c.split(';')[0]).join('; ');
    };

    const extractMetadata = ($) => {
        return {
            filename: $('.overflow-hidden img').attr('alt')?.trim(),
            mimetype: $('.divide-y span').first().text().trim(),
            upload_date: $('.divide-y .font-semibold').eq(2).text().trim(),
            download_count: $('.divide-y .font-semibold').eq(1).text().trim(),
            author_name: $('.divide-y a').first().text().trim()
        };
    };

    /**
     * ENDPOINT: GET /downloader/sfile?url=https://sfile.co/xxxxx
     * Desc: Download file dari sfile.co
     */
    app.get('/downloader/sfile', async (req, res) => {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({
                status: false,
                message: "Parameter 'url' wajib diisi! Contoh: /downloader/sfile?url=https://sfile.co/xxxxx"
            });
        }

        if (!url.includes('sfile.co')) {
            return res.status(400).json({
                status: false,
                message: "URL harus dari sfile.co"
            });
        }

        try {
            let h = createHeaders(url);

            // Step 1: Init request
            const initRes = await axios.get(url, { headers: h, timeout: 15000 });
            const ck = extractCookies(initRes.headers);
            if (ck) h.Cookie = ck;

            let $ = cheerio.load(initRes.data);
            const meta = extractMetadata($);

            const dl = $('#download').attr('data-dw-url');
            if (!dl) throw new Error('Download URL tidak ditemukan');

            h.Referer = dl;

            // Step 2: Process request
            const procRes = await axios.get(dl, { headers: h, timeout: 15000 });
            const ck2 = extractCookies(procRes.headers);
            if (ck2) h.Cookie = ck2;

            $ = cheerio.load(procRes.data);
            const scr = $('script').map((i, el) => $(el).html()).get().join('\n');

            const re = /https:\\\/\\\/download\d+\.sfile\.co\\\/downloadfile\\\/\d+\\\/\d+\\\/[a-z0-9]+\\\/[^\s'"]+\.[a-z0-9]+(\?[^"']+)?/gi;
            const mt = scr.match(re);

            if (!mt?.length) throw new Error('Link download final tidak ditemukan');

            const fin = mt[0].replace(/\\\//g, '/');

            res.json({
                status: true,
                metadata: meta,
                download: fin
            });

        } catch (err) {
            res.status(500).json({
                status: false,
                error: err.message
            });
        }
    });
};
