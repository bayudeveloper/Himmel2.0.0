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
    const { data } = await req(episodeUrl);
    const $ = cheerio.load(data);

    // Stream URL — coba berbagai selector
    const streamUrl =
        $('#pembed iframe').attr('src') ||
        $('#player iframe').attr('src') ||
        $('.playerbox iframe').attr('src') ||
        $('div[id*="player"] iframe').attr('src') ||
        $('div[id*="embed"] iframe').attr('src') ||
        $('iframe[src*="animekuindo"]').attr('src') ||
        $('iframe[src*="embed"]').attr('src') ||
        $('iframe').first().attr('src') ||
        null;

    // Mirror streams — coba berbagai selector
    const mirrorStreams = [];
    const mirrorSelectors = [
        '.mirrorstream ul li a',
        '.serverstream ul li a',
        '.server ul li a',
        '.mirror ul li a',
        'ul.mirror li a',
        'ul.server li a',
        '[class*="mirror"] li a',
        '[class*="server"] li a',
    ];

    for (const sel of mirrorSelectors) {
        $(sel).each((_, el) => {
            const provider    = $(el).text().trim();
            const dataContent = $(el).attr('data-content') ||
                                $(el).attr('data-src')     ||
                                $(el).attr('data-url')     ||
                                $(el).attr('href')         || null;
            if (provider && dataContent) mirrorStreams.push({ provider, dataContent });
        });
        if (mirrorStreams.length) break;
    }

    // Fallback: cari dari script tag
    const iframeSrcs = [];
    $('script').each((_, el) => {
        const src = $(el).html() || '';
        const matches = src.match(/(?:src|url)\s*[:=]\s*['"]([^'"]*(?:embed|player|stream)[^'"]*)['"]/gi) || [];
        matches.forEach(m => {
            const u = m.match(/['"]([^'"]+)['"]/)?.[1];
            if (u) iframeSrcs.push(u);
        });
    });

    return {
        streamUrl,
        mirrorStreams,
        ...(iframeSrcs.length ? { iframeSrcs } : {}),
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
