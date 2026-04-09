/**
 * [ Animekuindo Scraper ]
 *  Endpoints:
 *    GET /api/anime/search?query=...
 *    GET /api/anime/detail?url=...&stream=true
 *    GET /api/anime/episode?url=...
 */

const axios   = require('axios');
const cheerio = require('cheerio');
const crypto  = require('crypto');

const BASE_URL = 'https://s2.animekuindo.life';

const HDRS = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Ch-Ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Linux"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateCookies() {
    const ts  = Date.now();
    const r1  = crypto.randomBytes(4).readUInt32BE(0);
    const r2  = crypto.randomBytes(4).readUInt32BE(0);
    const sec = Math.floor(ts / 1000);
    return [
        `g_state={"i_l":0,"i_ll":${ts + 86400000},"i_b":"${crypto.randomBytes(32).toString('base64')}","i_e":{"enable_itp_optimization":0}}`,
        `_ga_JC7F2NZVN8=GS2.1.s${sec}$o1$g0$t${sec}$j60$l0$h0`,
        `_ga=GA1.1.${r1}.${sec}`,
        `HstCfa4980656=${ts}`,
        `HstCla4980656=${ts}`,
        `HstCmu4980656=${ts}`,
        `HstPn4980656=1`,
        `HstPt4980656=1`,
        `HstCnv4980656=1`,
        `HstCns4980656=1`,
        `_gcl_au=1.1.${r2}.${sec}`,
        `__dtsu=${crypto.randomBytes(16).toString('hex')}`,
        `_pubcid=${crypto.randomUUID()}`,
        `_cc_id=${crypto.randomBytes(16).toString('hex')}`,
    ].join('; ');
}

function req(url) {
    return axios.get(url, {
        headers: { ...HDRS, 'Referer': BASE_URL, 'Cookie': generateCookies() },
        timeout: 30000,
        family: 4,
    });
}

// ── Scrapers ──────────────────────────────────────────────────────────────────

async function searchAnime(keyword) {
    const { data } = await req(`${BASE_URL}/?s=${encodeURIComponent(keyword)}`);
    const $ = cheerio.load(data);
    const results = [];

    $('.listupd .bs').each((_, el) => {
        const title  = $(el).find('.tt h2').text().trim();
        const link   = $(el).find('.bsx a').attr('href');
        const image  = $(el).find('img').attr('src') || null;
        const status = $(el).find('.status').text().trim() || null;
        const type   = $(el).find('.typez').text().trim() || null;
        if (title && link) results.push({ title, link, image, status, type });
    });

    return results;
}

async function getEpisodeStream(episodeUrl) {
    const { data: html } = await req(episodeUrl);
    const $              = cheerio.load(html);

    // ── 1. Cari nonce & post ID dari inline script ────────────────────────
    let nonce  = '';
    let postId = '';
    $('script').each((_, el) => {
        const src = $(el).html() || '';
        const nonceMatch  = src.match(/["']nonce["']\s*:\s*["']([a-f0-9]+)["']/);
        const postIdMatch = src.match(/["']post_id["']\s*:\s*["']?(\d+)["']?/);
        const nonceMatch2 = src.match(/var\s+nonce\s*=\s*["']([a-f0-9]+)["']/);
        const nonceMatch3 = src.match(/nonce\s*:\s*["']([a-f0-9]+)["']/);
        if (nonceMatch)  nonce  = nonceMatch[1];
        if (nonceMatch2) nonce  = nonceMatch2[1];
        if (nonceMatch3) nonce  = nonceMatch3[1];
        if (postIdMatch) postId = postIdMatch[1];
    });

    // Fallback: post ID dari URL atau meta
    if (!postId) {
        const bodyClass = $('body').attr('class') || '';
        const pidMatch  = bodyClass.match(/postid-(\d+)/);
        if (pidMatch) postId = pidMatch[1];
    }

    // ── 2. Hit wp-admin/admin-ajax.php untuk stream ───────────────────────
    const ajaxUrl   = episodeUrl.replace(/\/[^/]+\/?$/, '') + '/../wp-admin/admin-ajax.php';
    const baseHost  = new URL(episodeUrl).origin;
    const ajaxBase  = `${baseHost}/wp-admin/admin-ajax.php`;

    const streamResults = [];

    if (postId) {
        // Action umum tema AnimeStream/Sora
        const actions = [
            { action: 'player_ajax',     data: { action: 'player_ajax',     post_id: postId, nonce } },
            { action: 'get_stream',      data: { action: 'get_stream',      post_id: postId, nonce } },
            { action: 'load_player',     data: { action: 'load_player',     id: postId, nonce } },
            { action: 'sora_player',     data: { action: 'sora_player',     post_id: postId, nonce } },
            { action: 'airi_ajax',       data: { action: 'airi_ajax',       post_id: postId, nonce } },
        ];

        for (const { action, data } of actions) {
            try {
                const form   = new URLSearchParams(data).toString();
                const result = await axios.post(ajaxBase, form, {
                    headers: {
                        ...HDRS,
                        'content-type': 'application/x-www-form-urlencoded',
                        'referer':      episodeUrl,
                        'x-requested-with': 'XMLHttpRequest',
                    },
                    timeout: 10000,
                    family: 4,
                });
                if (result.data && result.data !== '0' && result.data !== '-1') {
                    streamResults.push({ action, data: result.data });
                }
            } catch (_) {}
        }
    }

    // ── 3. Parse iframe dari hasil ajax ───────────────────────────────────
    let streamUrl = null;
    const mirrorStreams = [];

    for (const { data: ajaxHtml } of streamResults) {
        if (typeof ajaxHtml === 'string') {
            const $a = cheerio.load(ajaxHtml);
            const src = $a('iframe').first().attr('src');
            if (src && !src.includes('loading.gif')) { streamUrl = src; break; }
        } else if (typeof ajaxHtml === 'object') {
            // Response JSON langsung
            const src = ajaxHtml?.url || ajaxHtml?.embed || ajaxHtml?.src || ajaxHtml?.stream;
            if (src) { streamUrl = src; break; }
            if (Array.isArray(ajaxHtml?.servers)) {
                ajaxHtml.servers.forEach(s => mirrorStreams.push({ provider: s.name || s.server, url: s.url || s.src }));
            }
        }
    }

    // ── 4. Fallback: cek data-content di elemen yang ada di HTML awal ─────
    if (!streamUrl) {
        const selectors = [
            '[data-content]', '[data-src]', '[data-url]',
            '[data-video]',   '[data-embed]',
        ];
        for (const sel of selectors) {
            $(sel).each((_, el) => {
                const val = $(el).attr('data-content') ||
                            $(el).attr('data-src')     ||
                            $(el).attr('data-url')     ||
                            $(el).attr('data-video')   ||
                            $(el).attr('data-embed');
                if (val && !val.includes('loading.gif')) {
                    const label = $(el).text().trim() || $(el).attr('class') || 'Server';
                    mirrorStreams.push({ provider: label, dataContent: val });
                }
            });
            if (mirrorStreams.length) break;
        }
    }

    return {
        postId: postId || null,
        nonce:  nonce  || null,
        streamUrl,
        mirrorStreams,
        ajaxResults: streamResults.length ? streamResults : undefined,
    };
}


async function getAnimeDetail(url, includeStream = false) {
    const { data } = await req(url);
    const $ = cheerio.load(data);

    const title = $('h1.entry-title').text().trim();
    const image = $('.thumbook .thumb img').attr('src') || null;

    const info = {};
    $('.info-content .spe span').each((_, el) => {
        const text  = $(el).text().trim();
        const colon = text.indexOf(':');
        if (colon > 0) info[text.substring(0, colon).trim()] = text.substring(colon + 1).trim();
    });

    const genres = [];
    $('.genxed a').each((_, el) => genres.push($(el).text().trim()));

    const sinopsis      = $('.entry-content p').map((_, el) => $(el).text().trim()).get().join(' ');
    const ratingRaw     = $('.rating strong').text().trim().replace('Rating', '').trim();
    const ratingMatch   = ratingRaw.match(/(\d+\.\d+)/);
    const bookmarkRaw   = $('.bmc').text().trim().replace('Diikuti', '').replace('orang', '').trim();

    const episodeItems = $('.eplister ul li').toArray();
    const episodes = [];

    for (const el of episodeItems) {
        const episodeLink  = $(el).find('a').attr('href');
        const episodeNum   = $(el).find('.epl-num').text().trim();
        const episodeTitle = $(el).find('.epl-title').text().trim();
        const episodeDate  = $(el).find('.epl-date').text().trim();

        let stream = null;
        if (includeStream && episodeLink) {
            stream = await getEpisodeStream(episodeLink);
        }

        episodes.push({
            episode: episodeNum,
            title:   episodeTitle,
            link:    episodeLink || null,
            date:    episodeDate,
            stream,
        });
    }

    return {
        title,
        image,
        info,
        genres,
        sinopsis,
        rating:        ratingMatch ? parseFloat(ratingMatch[1]) : null,
        bookmarkCount: bookmarkRaw ? parseInt(bookmarkRaw) : null,
        totalEpisodes: episodes.length,
        episodes:      episodes.reverse(),
        url,
    };
}

// ── Express Routes ────────────────────────────────────────────────────────────

module.exports = function(app) {

    /**
     * GET /api/anime/search?query=solo+leveling
     * Return list hasil pencarian + detail lengkap anime pertama sekaligus
     */
    app.get('/anime/search', async (req, res) => {
        const { query } = req.query;

        if (!query) {
            return res.status(400).json({
                status:  false,
                message: 'Parameter ?query= wajib diisi',
            });
        }

        try {
            const results = await searchAnime(query);

            if (!results.length) {
                return res.json({ status: true, message: 'Tidak ada hasil ditemukan', results: [] });
            }

            const detail = await getAnimeDetail(results[0].link, false);

            res.json({
                status: true,
                total:  results.length,
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
     * GET /api/anime/episode?url=https://s2.animekuindo.life/...episode-1/
     * Fetch streamUrl + mirrorStreams dari satu episode.
     * url diambil dari field episodes[].link di response /anime/search
     */
    app.get('/anime/episode', async (req, res) => {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({
                status:  false,
                message: 'Parameter ?url= wajib diisi (ambil dari episodes[].link di /anime/search)',
            });
        }

        try {
            const stream = await getEpisodeStream(url);
            res.json({ status: true, result: stream });
        } catch (err) {
            res.status(500).json({ status: false, message: err.message });
        }
    });

};
