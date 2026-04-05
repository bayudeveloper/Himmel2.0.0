const fetch = require('node-fetch');

// ── Pinterest API function (dari BaseSearchResource) ─────────────────────────
async function pinterest(query) {
    const baseUrl = 'https://www.pinterest.com/resource/BaseSearchResource/get/';

    const queryParams = {
        source_url: '/search/pins/?q=' + encodeURIComponent(query),
        data: JSON.stringify({
            options: {
                isPrefetch: false,
                query,
                scope: 'pins',
                no_fetch_context_on_resource: false
            },
            context: {}
        }),
        _: Date.now()
    };

    const url = new URL(baseUrl);
    Object.entries(queryParams).forEach(([k, v]) => url.searchParams.set(k, v));

    const response = await fetch(url.toString(), {
        headers: {
            'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
            'Accept':          'application/json, text/javascript, */*, q=0.01',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer':         'https://www.pinterest.com/',
            'X-Requested-With': 'XMLHttpRequest',
            'X-APP-VERSION':   'b9e6a4e',
            'X-Pinterest-AppState': 'active',
        }
    });

    if (!response.ok) throw new Error(`Pinterest HTTP ${response.status}`);

    const json    = await response.json();
    const results = json?.resource_response?.data?.results ?? [];

    return results.map(item => ({
        id:         item.id         ?? '',
        pin:        'https://www.pinterest.com/pin/' + (item.id ?? ''),
        link:       item.link       ?? '',
        grid_title: item.grid_title ?? '',
        images_url: item.images?.['736x']?.url ?? '',
        created_at: item.created_at
            ? new Date(item.created_at).toLocaleDateString('id-ID', {
                day: 'numeric', month: 'long', year: 'numeric'
              })
            : '',
    }));
}

// ── Route ─────────────────────────────────────────────────────────────────────
module.exports = function(app) {

    /**
     * GET /search/pinterest?q=anime&count=25
     * Search Pinterest images — return array dengan images_url, pin url, dll
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
