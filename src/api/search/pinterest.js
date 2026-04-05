const fetch = require('node-fetch');

// ── Scrape Pinterest search via HTML — ambil imageSrcSet dari <link rel=preload> ──
async function pinterest(query) {
    const url = `https://id.pinterest.com/search/pins/?q=${encodeURIComponent(query)}&rs=typed`;

    const res = await fetch(url, {
        headers: {
            'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
            'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer':         'https://id.pinterest.com/',
            'sec-ch-ua':       '"Chromium";v="139", "Not;A=Brand";v="99"',
            'sec-ch-ua-mobile':'?0',
            'sec-fetch-dest':  'document',
            'sec-fetch-mode':  'navigate',
            'sec-fetch-site':  'same-origin',
            'Cache-Control':   'no-cache',
        },
    });

    if (!res.ok) throw new Error(`Pinterest HTTP ${res.status}`);
    const html = await res.text();

    // Ambil semua imageSrcSet dari <link rel="preload" as="image">
    const images = [];
    const re = /imageSrcSet="([^"]+)"/g;
    let m;

    while ((m = re.exec(html)) !== null) {
        const srcset = m[1];
        // Parse tiap resolusi: "URL 1x, URL 2x, URL 3x, URL 4x"
        const parts = {};
        for (const entry of srcset.split(',')) {
            const [imgUrl, res] = entry.trim().split(/\s+/);
            if (imgUrl && res) parts[res] = imgUrl;
        }
        // Prioritas: originals > 736x > 474x > 236x
        const best = parts['4x'] || parts['3x'] || parts['2x'] || parts['1x'];
        if (best) {
            images.push({
                '236x':      parts['1x'] || null,
                '474x':      parts['2x'] || null,
                '736x':      parts['3x'] || null,
                'originals': parts['4x'] || null,
                'url':       best,
            });
        }
    }

    return images;
}

// ── Route ─────────────────────────────────────────────────────────────────────
module.exports = function(app) {

    /**
     * GET /search/pinterest?q=anime&count=25
     * Response: array of images dengan 4 ukuran + url (best quality)
     */
    app.get('/search/pinterest', async (req, res) => {
        const { q, count = 25 } = req.query;

        if (!q) {
            return res.status(400).json({
                status:  false,
                message: "Parameter 'q' wajib diisi. Contoh: /search/pinterest?q=anime",
            });
        }

        try {
            const hasil  = await pinterest(q);
            const limit  = Math.min(parseInt(count) || 25, hasil.length);
            const sliced = hasil.slice(0, limit);

            if (!sliced.length) {
                return res.status(404).json({
                    status:  false,
                    message: `Tidak ada hasil untuk "${q}"`,
                });
            }

            return res.json({
                status: true,
                query:  q,
                total:  sliced.length,
                data:   sliced,
            });

        } catch (err) {
            return res.status(500).json({ status: false, error: err.message });
        }
    });
};
