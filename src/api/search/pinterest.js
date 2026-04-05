const axios = require('axios');

// ── Cookie Pinterest ───────────────────────────────────────────────────────────
const PINTEREST_COOKIE = [
    '_b="AZOdR7KiDIhOIoNZe+9eFcibXPYZ34ZrGflW8zMEzxJmGvSpj6gmxr/YHmT9FG0MEX0="',
    '_auth=1',
    '_pinterest_sess=TWc9PSY4TlJXOEJtNnZValhVMDU2eTEzYm1tL3kxK0hyRk5jWGx2dGtGcWovN2JTVHFybWZEN2E5bWF1em9PVjZTNm9FUkphT3Bvb0lkSzg2ajVsTUduTTZ3VkZoTWphZER1QnZxMWRxUDVjYjFWbXRuWjdXY3FTWXZTTE50NHJEMExmazBYMTRhQy9KWWljRkFITWZsSE5TcUxlNTFrait1d2R1ZDdNblllR3oxNi9uTWVMM1dMbnBENlR6STJ2aW1vekorNW1lWmMxRHNmQzVUTEg2bDdXQkJlVGtyRnQ0WHpiS0RTOVN4ZmZ5cjlyTWpDT0I5K091cFZsY1lVSkxRUjBoWXBKS0Vna2lmUFhtdGV4eGkzU3lqTS9NWjJrMXZoajJRQitSOUxFTDl5czdhY3JWdk84bnIyTk1lUms3OGRSZUQxTGY3Y28xekRUZE5Oa1F4WnJUdllGajZVY253WnNrWm13ZGNXazJ4ZTgvMzB6ZXpXK1BMekg3MlN0dms3NFVydTdYV0k0SEpBU1BqaXRxdU9MQmZCVFVad0w1WmptbWpqMlNtcUR5bW5VNU1QUXBsaE8zR01uQ1BWakpzWHV0QXVxSG5aaWlFL2ZYZ3VheTVSZHFhRVVieDliaEdKRHIrMGZPTmRhK2t0bm83RDRDL1ZkODVoSTRzQ0VBYkVvMWNXc05PV2xOczlML0F1ZU0vMVBIbGQ3d1ZIKytTMGgzY1hSU21vbm16SDFIMWFVY1pyRjAzTVJVTEdxdkh1SytsemJBUVJsNGoxNXQ3a1RmN2QrUHJ5Tlp2MWFPeEFaTGluUWpVSDNOMUdOYWh1WUNZR2grNzNGYnJ4aWttUElNdDM0SDJxQTZWUEhtbVBhNUw2SnNPTWJtaEtxZFp5M1dKZXlUWkczaTBpd3h0OGJuSU1UWWt5enBVcVhkRzIxOHR2bkFUZXM2a0owUXdpOTlNbS9TYmlaaHRQSEZtN2hJUTc4K05BbFh1dHRiMURlSlU5ZjY5VElCcjA1dW5HVGRmZStuREtjcEY3L0FjMHZhZGZmV2ozY3pJaXVvaWo3UFpjbmRLWDh0VUlOeUJEL1o3aFJlOEsvQ2ZCVStCdW5OWGgrYldpWWwyRnQxMGVwWHM0RmFpR3U2Z2h0ZXpDWHpOWkJWczRrSFJ0OGJaT2VXZWZGZk1CcGdLbDNjYmEvQjYxQnJPY3VQSEYraEVpTkZHMU5xdHZBTnpYWnl2elFza21qWjF1U3ZRalU5ekpjNU9ycHdKcVJZOTVvSXZwUDNKdFNvQnV3TlRudWlRZVZaaVdHbitZeU91eUlSc2VESFY1WVp3MHJqQzh2UW83T2xHWWd3QUZPck84T0lDeVJCN0V3aTc1MUxtRkdlT1QzM0RSZUF0WlJJMGxZLy9pcnBHb0VtUGl1OHoyZUh0RER2NmJGYWticTk5c210a3ZiWTNnNDc0L3pwdHNuSTM3SHBUOE9LNUdKNG5kTXd4ZkRhVmhQNjVYdzFTbFFzSjZuMzZKbWtvMlhGdnF5QnJ3T1VCOHR3aEkrZDFWVmpjU2xqSlB3NitZdzFzTk8vbWVBMjA1R1F4YVc5MFY2TjMxNDJLWWdXMnJBazY2aXVzN1JBbnAxVHVwNndoWC8wSzN2TjFGKyswcC94SFNoYWd4Z0ZjTm1scm9kN2dUc2JqaE9jcSt0UXdsalY1TUFFWVJ3UlNscEo1SFlyM2E3by9VYjFqb1p4UFNoSm9KWjBZem85UTBCRWx3c1RlWnZTckhGbExFM2Ivc1YvREJpaFMyelEmOWI1L2oyaEJVd3ZZdlRaVTYzSkpUTk1ZQ3pBPQ==',
    '__Secure-s_a=YjQxSWFjZ3FxaGVndEU4NWNlRjNha2xicjkyRHRWblNqYnpJZTZleUY3VkQxc2t1THJBcVF1MzQ4YW00dDVUVnVMMlI2OGFQNTBSVkkyUTliN2pQMGtHL1ZQZTFmQzVqUVJHTFFub0NjOVIxTEZWT01lcXRRMlk2Tk1nZWJVRjJPOXgzRlhBZVJYUXluN015b2JRbFRCSk9MQkRHVDQ2b09FbG03Y0phRlZNTUZScHg4cnJSWFRaUlBPam5TWkxDbUh3eVZuYmt5WWtpL3JzbTVkWlRFVXowd3FtTDVzbHpXNTFhTUJMayttcFNKVDM5R1BHVDFzVXlOR3BUOW1QNjhDenc0c1RtT0tpeG0wYUMvdGtMckhRM3RIUTVzMVJOaXg3WGxlV09iZlFGUy8vSDhWLzhRQncveXNiaTBZYWYrbzhkdUozTFZZajh6aEVpOWZSNk01b3Vya3JhSzVMbTFoZVZyUFdpMUhFSk1YOW1qV2laeGdCVHlZbndlZE9kRDlnR0xZUXc4c2dpUTdWaXVUOUNyMmtZSWozNE5vSSttUEltcllPRVhzamQxNFZ0aVFvTUYvQ2F5Um1ZQlNBZU16N1VEZ0hLRmZHSC8yQkJnanR2ZzJESEFjQS9qR3lweTFhZlVZalJsMmtUS05ZVzJGUXhjOGpObjdEaXp0WkVNenZMWThvYVBiUWZNUE5MNmlMRnpoQlhXeGpDMEVrbUx0NlVRTndLVkJGemhsOWxadjJJZlBsY1FEaEk1ekhCOWg3eVN0QUpBbnhNZ2NHZ3Z3bW45aDQ0M3dTZ3E1ZjMyMXoxMWdLK2dMN1JJZEgrN1I1SFE0YjNTbDhIUjJJTEpzbkE0aS9qZG40M1pnWVZleS9aUU9xTnl1K1k0dDFHQ2JmYVNobkFUaHBLZ1dqVmNlRWhFaEl6YTF2bFlUcDF3SUhKeFoxMHRaV1JUWHFmbUtEWHpzNDlzWmFIbmdJTzR6Ly9BM2MyU1BnUGJDWUwvWWk2S2VscmJhS2d2VlJWRUI0RWl5cDIrYXNMOWl5UENQTUNSQXZJbi9QSEZyK243MXdxY2tkQkdaeVEwYzcvVnA0K2hCcE0rbFR6KzdjdU8zb29mK3VaNFhXYzBzcnhRUHI1N3Zjc3dPT0h2a2R0RjZyTTBuRmhFVWJXMWRMVGVoUklxcWFQQkU1a3o2RlJnVHJMcXlFTGpUQ1ZuVWVNUjB1SHRJVGtMemFsdXVRWHdVQ0N6QTFod2pyQnhxT0wra3hYN3Z1d3RlU0N1aE5iZmVuekVabXdyQWdxSmdjQmZqa2FXd1hRZGd1T2dBUFpQOVZDYUxhU1lzaz0mMzRnNnBTNW1LUDUwZmhyK1NNVDhOSjdsV2ZENQ==',
    'csrftoken=3f7f47a7442948f2458443314570f9e7',
    '_routing_id="0d28a52e-14a7-4605-b6c8-9b7caa0bd81b"',
    'sessionFunnelEventLogged=1',
].join('; ');

// ── Parse imageSrcSet dari HTML ───────────────────────────────────────────────
function parseImages(html) {
    const images = [];
    const re = /<link[^>]+imageSrcSet="([^"]+)"[^>]*>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const srcset = m[1];
        const parts  = {};
        for (const entry of srcset.split(',')) {
            const trimmed  = entry.trim();
            const spaceIdx = trimmed.lastIndexOf(' ');
            if (spaceIdx === -1) continue;
            const imgUrl = trimmed.slice(0, spaceIdx).trim();
            const res    = trimmed.slice(spaceIdx + 1).trim();
            if (imgUrl && res) parts[res] = imgUrl;
        }
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

// ── Fetch Pinterest search ────────────────────────────────────────────────────
async function pinterest(query) {
    const url = `https://id.pinterest.com/search/pins/?q=${encodeURIComponent(query)}&rs=typed`;
    console.log('[Pinterest] Fetching:', url);

    const response = await axios.get(url, {
        decompress:    true,
        responseType:  'text',
        maxRedirects:  5,
        timeout:       15000,
        headers: {
            'User-Agent':                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
            'Accept':                    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language':           'en-US,en;q=0.9',
            'Accept-Encoding':           'gzip, deflate, br',
            'Cache-Control':             'max-age=0',
            'Cookie':                    PINTEREST_COOKIE,
            'Referer':                   'https://id.pinterest.com/',
            'sec-ch-ua':                 '"Chromium";v="139", "Not A;Brand";v="99"',
            'sec-ch-ua-mobile':          '?0',
            'sec-ch-ua-platform':        '"Linux"',
            'sec-fetch-dest':            'document',
            'sec-fetch-mode':            'navigate',
            'sec-fetch-site':            'same-origin',
            'sec-fetch-user':            '?1',
            'Upgrade-Insecure-Requests': '1',
        },
    });

    const html = response.data;
    console.log('[Pinterest] Status       :', response.status);
    console.log('[Pinterest] HTML length  :', html.length);
    console.log('[Pinterest] imageSrcSet  :', html.includes('imageSrcSet'));
    console.log('[Pinterest] loginPage    :', html.includes('"loginPage"'));
    console.log('[Pinterest] Preview      :', html.slice(0, 300));

    if (!html.includes('imageSrcSet')) {
        // Simpan HTML untuk debug manual
        require('fs').writeFileSync('/tmp/pinterest_debug.html', html);
        console.error('[Pinterest] Debug HTML → /tmp/pinterest_debug.html');
        throw new Error('imageSrcSet tidak ditemukan dalam response. Kemungkinan cookie expired atau kena bot-detect.');
    }

    const images = parseImages(html);
    console.log('[Pinterest] Total gambar :', images.length);
    return images;
}

// ── Route ─────────────────────────────────────────────────────────────────────
module.exports = function(app) {

    /**
     * GET /search/pinterest?q=anime&count=25
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
            console.error('[Pinterest] ERROR :', err.message);
            console.error('[Pinterest] Stack :', err.stack);
            return res.status(500).json({ status: false, error: err.message });
        }
    });
};
