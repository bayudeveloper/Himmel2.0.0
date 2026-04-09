/**
 * [ LK21 Scraper ]
 *  Endpoints:
 *    GET /api/lk21/search?query=...&page=...
 *    GET /api/lk21/download?url=...
 */

const axios  = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://tv10.lk21official.cc';

const HDRS = {
    'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
    'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function httpGet(url, extraHeaders = {}) {
    const res = await axios.get(url, {
        headers: { ...HDRS, ...extraHeaders },
        responseType: 'text',
        timeout: 15000,
    });
    return res.data;
}

async function httpPost(url, body, extraHeaders = {}) {
    const params = new URLSearchParams(body).toString();
    const res = await axios.post(url, params, {
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
            ...HDRS,
            ...extraHeaders,
        },
        responseType: 'text',
        timeout: 15000,
    });
    return res.data;
}

async function getCFSession(url) {
    const res = await axios.post(
        'https://cf-solver-renofc.my.id/api/solvebeta',
        { url, mode: 'waf-session' },
        { headers: { 'content-type': 'application/json' }, timeout: 20000 }
    );
    return res.data;
}

function sessionToCookie(session) {
    return session?.cookies?.map(c => `${c.name}=${c.value}`).join('; ') || '';
}

// ── Search ───────────────────────────────────────────────────────────────────

async function search(query, page = 1) {
    const session  = await getCFSession('https://gudangvape.com');
    const cookies  = sessionToCookie(session);
    const ua       = session?.headers?.['user-agent'] || HDRS['user-agent'];

    const url = `https://gudangvape.com/search.php?s=${encodeURIComponent(query)}&page=${page}`;
    const res = await axios.get(url, {
        headers: {
            ...HDRS,
            'user-agent': ua,
            'cookie': cookies,
            'referer': `${BASE_URL}/`,
        },
        timeout: 15000,
    });

    const data  = res.data;
    const items = data?.data || data?.items || [];

    return items.map(item => ({
        title:   item.title,
        slug:    item.slug,
        url:     `${BASE_URL}/${item.slug}`,
        year:    item.year,
        rating:  item.rating,
        quality: item.quality,
        poster:  item.poster,
    }));
}

// ── Detail ───────────────────────────────────────────────────────────────────

async function getDetail(movieUrl) {
    const html = await httpGet(movieUrl);
    const $    = cheerio.load(html);

    const info = {
        title:       $('h1').first().text().trim(),
        rating:      $('.info-tag span strong').first().text().trim(),
        synopsis:    $('.synopsis').text().trim(),
        genres:      [],
        cast:        [],
        director:    '',
        quality:     '',
        duration:    '',
        poster:      $('img.poster, .poster img, .film-poster img').first().attr('src') || '',
        downloadUrl: $('a[title^="Download"]').attr('href') || null,
    };

    $('.tag-list .tag a').each((_, el) => info.genres.push($(el).text().trim()));

    $('.detail p').each((_, el) => {
        const label = $(el).find('span').text().trim();
        const val   = $(el).text().replace(label, '').trim();
        if (label.includes('Bintang'))   info.cast     = val.split(',').map(s => s.trim()).filter(Boolean);
        if (label.includes('Sutradara')) info.director = val;
    });

    const infoTag = $('.info-tag span').map((_, el) => $(el).text().trim()).get();
    info.quality  = infoTag.filter(t => ['WEBDL','BLURAY','HDCAM','720p','1080p','480p'].some(q => t.includes(q))).join(' ').trim();
    info.duration = infoTag.find(t => t.includes('h') || t.includes('m')) || '';

    return info;
}

// ── Download Links ───────────────────────────────────────────────────────────

async function getDownloadLinks(dlUrl) {
    const session  = await getCFSession(dlUrl);
    const cookies  = sessionToCookie(session);
    const ua       = session?.headers?.['user-agent'] || HDRS['user-agent'];

    const res = await axios.get(dlUrl, {
        headers: { ...HDRS, 'user-agent': ua, 'cookie': cookies, 'referer': `${BASE_URL}/` },
        responseType: 'text',
        timeout: 15000,
    });

    const setCookies      = res.headers['set-cookie'] || [];
    const setCookieHeader = setCookies.map(c => c.split(';')[0]).join('; ');
    const html            = res.data;

    const $             = cheerio.load(html);
    const scriptContent = $('script').map((_, el) => $(el).html()).get().join('');
    const validateMatch = scriptContent.match(/setCookie\('validate',\s*'([^']+)'/);
    const validateCookie = validateMatch?.[1] || '';
    const slug          = dlUrl.replace(/\/$/, '').split('/').pop();

    const dynamicHtml = await httpPost(
        `https://dl.lk21.party/verifying.php?slug=${slug}`,
        { slug },
        {
            'user-agent':        ua,
            'referer':           dlUrl,
            'cookie':            `${cookies}; ${setCookieHeader}; validate=${validateCookie}`,
            'x-requested-with':  'XMLHttpRequest',
        }
    );

    const $d    = cheerio.load(dynamicHtml);
    const links = [];

    $d('table tbody tr').each((_, el) => {
        const provider = $d(el).find('td:first-child strong').text().trim();
        const a        = $d(el).find('a');
        const url      = a.attr('href');
        const quality  = a.text().trim().match(/\d+p/)?.[0] || '';
        if (provider && url) links.push({ provider, quality, url });
    });

    return links;
}

// ── Express Routes ───────────────────────────────────────────────────────────

module.exports = function(app) {

    /**
     * GET /api/lk21/search?query=avengers&page=1
     * Sekaligus return detail film pertama dari hasil pencarian
     */
    app.get('/lk21/search', async (req, res) => {
        const { query, page = 1 } = req.query;

        if (!query) {
            return res.status(400).json({
                status:  false,
                message: 'Parameter ?query= wajib diisi',
            });
        }

        try {
            const results = await search(query, parseInt(page));
            if (!results.length) {
                return res.json({ status: true, message: 'Tidak ada hasil ditemukan', results: [] });
            }

            // Ambil detail film pertama langsung
            const detail = await getDetail(results[0].url);

            res.json({
                status: true,
                total:  results.length,
                page:   parseInt(page),
                result: {
                    ...results[0],
                    ...detail,
                },
                others: results.slice(1),
            });
        } catch (err) {
            res.status(500).json({ status: false, message: err.message });
        }
    });

    /**
     * GET /api/lk21/download?url=https://dl.lk21.party/...
     * url diambil dari field downloadUrl di response /lk21/search
     */
    app.get('/lk21/download', async (req, res) => {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({
                status:  false,
                message: 'Parameter ?url= wajib diisi (ambil dari downloadUrl di /lk21/search)',
            });
        }

        try {
            const links = await getDownloadLinks(url);
            if (!links.length) {
                return res.json({ status: true, message: 'Link download tidak ditemukan', links: [] });
            }
            res.json({ status: true, total: links.length, links });
        } catch (err) {
            res.status(500).json({ status: false, message: err.message });
        }
    });

};
