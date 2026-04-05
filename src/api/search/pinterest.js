const axios      = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

// ── Proxy List (Webshare) ─────────────────────────────────────────────────────
const PROXIES = [
    '31.59.20.176:6754:yfjfjudg:cebic9so4bvr',
    '23.95.150.145:6114:yfjfjudg:cebic9so4bvr',
    '198.23.239.134:6540:yfjfjudg:cebic9so4bvr',
    '45.38.107.97:6014:yfjfjudg:cebic9so4bvr',
    '107.172.163.27:6543:yfjfjudg:cebic9so4bvr',
    '198.105.121.200:6462:yfjfjudg:cebic9so4bvr',
    '216.10.27.159:6837:yfjfjudg:cebic9so4bvr',
    '142.111.67.146:5611:yfjfjudg:cebic9so4bvr',
    '191.96.254.138:6185:yfjfjudg:cebic9so4bvr',
    '31.58.9.4:6077:yfjfjudg:cebic9so4bvr',
];

// Ambil proxy random setiap request
function getRandomProxy() {
    const raw  = PROXIES[Math.floor(Math.random() * PROXIES.length)];
    const [host, port, user, pass] = raw.split(':');
    const url  = `http://${user}:${pass}@${host}:${port}`;
    console.log(`[Pinterest] Proxy: ${host}:${port}`);
    return new HttpsProxyAgent(url);
}

// ── Cookie Pinterest ───────────────────────────────────────────────────────────
const PINTEREST_COOKIE = [
    '_b="AZOdR7KiDIhOIoNZe+9eFcibXPYZ34ZrGflW8zMEzxJmGvSpj6gmxr/YHmT9FG0MEX0="',
    '_auth=1',
    '_pinterest_sess=TWc9PSY4TlJXOEJtNnZValhVMDU2eTEzYm1tL3kxK0hyRk5jWGx2dGtGcWovN2JTVHFybWZEN2E5bWF1em9PVjZTNm9FUkphT3Bvb0lkSzg2ajVsTUduTTZ3VkZoTWphZER1QnZxMWRxUDVjYjFWbXRuWjdXY3FTWXZTTE50NHJEMExmazBYMTRhQy9KWWljRkFITWZsSE5TcUxlNTFrait1d2R1ZDdNblllR3oxNi9uTWVMM1dMbnBENlR6STJ2aW1vekorNW1lWmMxRHNmQzVUTEg2bDdXQkJlVGtyRnQ0WHpiS0RTOVN4ZmZ5cjlyTWpDT0I1K091cFZsY1lVSkxRUjBoWXBKS0Vna2lmUFhtdGV4eGkzU3lqTS9NWjJrMXZoajJRQitSOUxFTDl5czdhY3JWdk84bnIyTk1lUms3OGRSZUQxTGY3Y28xekRUZE5Oa1F4WnJUdllGajZVY253WnNrWm13ZGNXazJ4ZTgvMzB6ZXpXK1BMekg3MlN0dms3NFVydTdYV0k0SEpBU1BqaXRxdU9MQmZCVFVad0w1WmptbWpqMlNtcUR5bW5VNU1QUXBsaE8zR01uQ1BWakpzWHV0QXVxSG5aaWlFL2ZYZ3VheTVSZHFhRVVieDliaEdKRHIrMGZPTmRhK2t0bm83RDRDL1ZkODVoSTRzQ0VBYkVvMWNXc05PV2xOczlML0F1ZU0vMVBIbGQ3d1ZIKytTMGgzY1hSU21vbm16SDFIMWFVY1pyRjAzTVJVTEdxdkh1SytsemJBUVJsNGoxNXQ3a1RmN2QrUHJ5Tlp2MWFPeEFaTGluUWpVSDNOMUdOYWh1WUNZR2grNzNGYnJ4aWttUElNdDM0SDJxQTZWUEhtbVBhNUw2SnNPTWJtaEtxZFp5M1dKZXlUWkczaTBpd3h0OGJuSU1UWWt5enBVcVhkRzIxOHR2bkFUZXM2a0owUXdpOTlNbS9TYmlaaHRQSEZtN2hJUTc4K05BbFh1dHRiMURlSlU5ZjY5VElCcjA1dW5HVGRmZStuREtjcEY3L0FjMHZhZGZmV2ozY3pJaXVvaWo3UFpjbmRLWDh0VUlOeUJEL1o3aFJlOEsvQ2ZCVStCdW5OWGgrYldpWWwyRnQxMGVwWHM0RmFpR3U2Z2h0ZXpDWHpOWkJWczRrSFJ0OGJaT2VYZWZGZk1CcGdLbDNjYmEvQjYxQnJPY3VQSEYraEVpTkZHMU5xdHZBTnpYWnl2elFza21qWjF1U3ZRalU5ekpjNU9ycHdKcVJZOTVvSXZwUDNKdFNvQnV3TlRudWlRZVZaaVdHbitZeU91eUlSc2VESFY1WVp3MHJqQzh2UW83T2xHWWd3QUZPck84T0lDeVJCN0V3aTc1MUxtRkdlT1QzM0RSZUF0WlJJMGxZLy9pcnBHb0VtUGl1OHoyZUh0RER2NmJGYWticTk5c210a3ZiWTNnNDc0L3pwdHNuSTM3SHBUOE9LNUdKNG5kTXd4ZkRhVmhQNjVYdzFTbFFzSjZuMzZKbWtvMlhGdnF5QnJ3T1VCOHR3aEkrZDFWVmpjU2xqSlB3NitZdzFzTk8vbWVBMjA1R1F4YVc5MFY2TjMxNDJLWWdXMnJBazY2aXVzN1JBbnAxVHVwNndoWC8wSzN2TjFGKyswcC94SFNoYWd4Z0ZjTm1scm9kN2dUc2JqaE9qcSt0UXdsalY1TUFFWVJ3UlNscEo1SFlyM2E3by9VYjFqb1p4UFNoSm9KWjBZem85UTBCRWx3c1RlWnZTckhGbExFM2Ivc1YvREJpaFMyelEmOWI1L2oyaEJVd3ZZdlRaVTYzSkpUTk1ZQ3pBPQ==',
    '__Secure-s_a=YjQxSWFjZ3FxaGVndEU4NWNlRjNha2xicjkyRHRWblNqYnpJZTZleUY3VkQxc2t1THJBcVF1MzQ4YW00dDVUVnVMMlI2OGFQNTBSVkkyUTliN2pQMGtHL1ZQZTFmQzVqUVRHTFFub0NjOVIxTEZWT01lcXRRMlk2Tk1nZWJVRjJPOXgzRlhBZVJYUXluN015b2JRbFRCSk9MQkRHVDQ2b09FbG03Y0phRlZNTUZScHg0cnJSWFRaUlBPam5TWkxDbUh3eVpuYmt5WWtpL3JzbTVkWlRFVXowd3FtTDVzbHpXNTFhTUJMayttcFNKVDM5R1BHVDFzVXlOR3BUOW1QNjhDenc0c1JtT0tpeG0wYUMvdGtMckhRM3RIUTVzMVJOaXg3WGxlV09iZlFGUy8vSDhWLzhRQncveXNiaTBZYWYrbzhkdUozTFZZajh6aEVpOWZSNk01b3Vya3JhSzVMbTFoZVZyUFdpMUhFSk1YOW1qV2laeGdCVHlZbndlZE9kRDlnR0xZUXc4c2dpUTdWaXVUOUNyMmtZSWozNE5vSSttUEltcllPRVhzamQxNFZ0aVFvTUYvQ2F5Um1ZQlNBZU16N1VEZ0hLRmZHSC8yQkJnanR2ZzJESEFqQS9qR3lweTFhZlVZalJsMmtUS05ZVzJGUXhjOGpObjdEaXp0WkVNenZMWThvYVBiUWZOUE5MNmlNRnpoQlhXeGpDMEVrbUx0NlVRTndLVkJGemhsOWxadjJKZlBsY1FEaUk1ekhCOWc3eVN0QUpBbnhNZ2NHZ3Z3bW41aDQ0M3dTZ3E1ZjMyMXoxMWdLK2dMN1JKZEgrN1I1SFE0YjNUbDhIUjJKTEpzbkE0aS9qZG40M1puWVZleS9aUU9xTnl1K1k0dDFIQ2pmYVRobkFVaHBLZ1dqVmNlRlhFaEl6YTF2bllUcDF3SUhLZVoxMHRaV1JUWHFmbVdEV3pzNDlzWmFJbmdJTzV6Ly9CM2MyU1BuUGJEWVcvWWkyS2VscmNhS2d3VlJXRUI1RWp5cDMrYXNNOWl5VUNRTUNTQXZKbi9RSEZzK243MXdyY2xkQ0daWVEwYzgvVm80K2hCcU4rbFQ3KzdjdU8zb29nK3VhNFhZYzBzcnhRUHI2N1ZjdHdQUEloMmtyZFJaeTBCblJoRVZiWTFkTVZVZWhVSnhxYWFRQ0VVa3o3RlNuVXJNc3lGTGpWQ1ZuVmZOVjB2SHZKVmtNZXplbHVVUlh3VUNEZ1QxaHdqc0J5d1RPTCtyeFk3dnV4dGZUQ3ZoTmNmZW56Rmx3eUFoeFpnY0JmanFiV2R4UlpndzFTZ0FRWVBPVkRhTGJTV3lhazA9JjM1bjdwVTZtS1A2MWZocitUTlQ5TkxlbFZhWT0=',
    'csrftoken=3f7f47a7442948f2458443314570f9e7',
    '_routing_id="0d28a52e-14a7-4605-b6c8-9b7caa0bd81b"',
    'sessionFunnelEventLogged=1',
    'g_state={"i_l":0,"i_ll":1775366622435,"i_b":"PRTId5z6NvZZ9tbOOb1R/TtJD1pK809cSd9/HgSaahY","i_e":{"enable_itp_optimization":0}}',
].join('; ');

// ── Parse imageSrcSet dari HTML ───────────────────────────────────────────────
function parseImages(html) {
    const images = [];
    const re = /imageSrcSet="([^"]+)"/g;
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

    // Coba tiap proxy sampai berhasil
    for (let i = 0; i < PROXIES.length; i++) {
        const raw   = PROXIES[Math.floor(Math.random() * PROXIES.length)];
        const [host, port, user, pass] = raw.split(':');
        const proxyUrl   = `http://${user}:${pass}@${host}:${port}`;
        const proxyAgent = new HttpsProxyAgent(proxyUrl);

        console.log(`[Pinterest] [attempt ${i + 1}] proxy: ${host}:${port} → ${url}`);

        try {
            const response = await axios.get(url, {
                decompress:   true,
                responseType: 'text',
                maxRedirects: 5,
                timeout:      12000,
                httpsAgent:   proxyAgent,
                proxy:        false, // matikan proxy bawaan axios, pakai agent
                headers: {
                    'User-Agent':                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
                    'Accept':                    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language':           'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
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
            const lang = (html.match(/lang="([^"]+)"/) || [])[1] || '?';
            console.log(`[Pinterest] status: ${response.status}, length: ${html.length}, lang: ${lang}, imageSrcSet: ${html.includes('imageSrcSet')}`);

            if (html.includes('imageSrcSet')) {
                const images = parseImages(html);
                console.log(`[Pinterest] ✓ Berhasil! ${images.length} gambar via proxy ${host}:${port}`);
                return images;
            }

            console.warn(`[Pinterest] imageSrcSet tidak ada (lang=${lang}), coba proxy lain...`);

        } catch (err) {
            console.error(`[Pinterest] Proxy ${host}:${port} error:`, err.message);
        }
    }

    throw new Error('Semua proxy gagal atau imageSrcSet tidak ditemukan. Cookie mungkin expired.');
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
            return res.status(500).json({ status: false, error: err.message });
        }
    });
};
