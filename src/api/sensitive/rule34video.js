const axios   = require('axios');
const cheerio = require('cheerio');
const https   = require('https');
const zlib    = require('zlib');
const { HttpsProxyAgent } = require('https-proxy-agent');

const BASE_URL = 'https://rule34video.com';

const PROXIES = [
  'http://yfjfjudg:cebic9so4bvr@31.59.20.176:6754',
  'http://yfjfjudg:cebic9so4bvr@23.95.150.145:6114',
  'http://yfjfjudg:cebic9so4bvr@198.23.239.134:6540',
  'http://yfjfjudg:cebic9so4bvr@45.38.107.97:6014',
  'http://yfjfjudg:cebic9so4bvr@107.172.163.27:6543',
  'http://yfjfjudg:cebic9so4bvr@198.105.121.200:6462',
  'http://yfjfjudg:cebic9so4bvr@216.10.27.159:6837',
  'http://yfjfjudg:cebic9so4bvr@142.111.67.146:5611',
  'http://yfjfjudg:cebic9so4bvr@191.96.254.138:6185',
  'http://yfjfjudg:cebic9so4bvr@31.58.9.4:6077',
];

let proxyIdx = 0;
function getProxy() {
  const p = PROXIES[proxyIdx % PROXIES.length];
  proxyIdx++;
  return p;
}

function makeAxios(referer = BASE_URL + '/') {
  const proxyUrl = getProxy();
  return axios.create({
    httpsAgent: new HttpsProxyAgent(proxyUrl),
    proxy: false,
    timeout: 30000,
    maxRedirects: 5,
    headers: {
      'User-Agent':                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
      'Accept':                    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language':           'en-US,en;q=0.9',
      'Accept-Encoding':           'gzip, deflate, br',
      'Referer':                   referer,
      'Cache-Control':             'max-age=0',
      'sec-ch-ua':                 '"Chromium";v="139", "Not;A=Brand";v="99"',
      'sec-ch-ua-mobile':          '?0',
      'sec-ch-ua-platform':        '"Windows"',
      'sec-fetch-dest':            'document',
      'sec-fetch-mode':            'navigate',
      'sec-fetch-site':            'none',
      'Upgrade-Insecure-Requests': '1',
    },
    responseType: 'arraybuffer',
  });
}

async function fetchHtml(url, referer = BASE_URL + '/') {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await makeAxios(referer).get(url);
      const buf = Buffer.from(res.data);
      const enc = (res.headers['content-encoding'] || '').toLowerCase();
      if (enc.includes('br')) {
        return await new Promise((r, j) => zlib.brotliDecompress(buf, (e, d) => e ? j(e) : r(d.toString('utf8'))));
      } else if (enc.includes('gzip')) {
        return await new Promise((r, j) => zlib.gunzip(buf, (e, d) => e ? j(e) : r(d.toString('utf8'))));
      } else if (enc.includes('deflate')) {
        return await new Promise((r, j) => zlib.inflate(buf, (e, d) => e ? j(e) : r(d.toString('utf8'))));
      }
      return buf.toString('utf8');
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  throw lastErr;
}

// ── Parse search results ──────────────────────────────────────────────────────
function parseSearch(html) {
  const $ = cheerio.load(html);
  const videos = [];

  $('.item.thumb').each((_, el) => {
    const $el       = $(el);
    const title     = $el.find('.thumb_title').text().trim();
    const $img      = $el.find('img.thumb');
    const thumbnail = $img.attr('data-original') || $img.attr('data-webp') || $img.attr('src') || null;
    const href      = $el.find('a.th').attr('href');
    const videoUrl  = href ? (href.startsWith('http') ? href : BASE_URL + href) : null;
    const duration  = $el.find('.time').text().trim() || null;
    const views     = $el.find('.views').text().trim() || null;
    const rating    = $el.find('.rating').text().trim() || null;
    const preview   = $el.find('.wrap_image').attr('data-preview') || null;

    if (title && videoUrl) {
      videos.push({ title, thumbnail, video_url: videoUrl, preview_video: preview, duration, views, rating });
    }
  });

  const totalText = $('.total_results').text().trim() || null;
  const hasNext   = $('.pagination .next').length > 0;

  return { total: totalText, has_next_page: hasNext, videos };
}

// ── Parse video detail page ───────────────────────────────────────────────────
function parseDetail(html) {
  const $ = cheerio.load(html);

  // Video source langsung dari <video><source>
  const videoSource = $('video source').first().attr('src') || null;
  const thumbnail   = $('video').attr('poster') || null;

  // Title
  const title = $('h1.title').text().trim()
    || $('.headline h1').text().trim()
    || $('title').text().replace('| Rule34Video', '').trim()
    || null;

  // Tags
  const tags = [];
  $('.tags a').each((_, el) => { const t = $(el).text().trim(); if (t) tags.push(t); });

  // Categories
  const categories = [];
  $('.categories a').each((_, el) => { const c = $(el).text().trim(); if (c) categories.push(c); });

  // Duration, views dari meta atau page elements
  const duration = $('.video_info .duration').text().trim() || $('.video-duration').text().trim() || null;
  const views    = $('.video_info .views').text().trim() || $('.views-wrapper').text().trim() || null;

  // Description
  const description = $('.description').text().trim() || null;

  return { title, video_source: videoSource, thumbnail, duration, views, description, tags, categories };
}

// ── Route registration ────────────────────────────────────────────────────────
module.exports = function(app) {

  /**
   * GET /nsfw/rule34video/search?q=nahida&page=1
   * Search rule34video.com
   */
  app.get('/nsfw/rule34video/search', async (req, res) => {
    const { q, page = 1 } = req.query;

    if (!q) {
      return res.status(400).json({
        status: false,
        message: "Parameter 'q' wajib diisi. Contoh: /nsfw/rule34video/search?q=nahida",
      });
    }

    try {
      const pageNum     = parseInt(page) || 1;
      const searchQuery = q.trim().replace(/\s+/g, '-');
      const url = pageNum > 1
        ? `${BASE_URL}/search/${encodeURIComponent(searchQuery)}/${pageNum}/`
        : `${BASE_URL}/search/${encodeURIComponent(searchQuery)}/`;

      const html  = await fetchHtml(url);
      const data  = parseSearch(html);

      return res.json({
        status:        true,
        query:         q,
        page:          pageNum,
        total:         data.total,
        has_next_page: data.has_next_page,
        count:         data.videos.length,
        videos:        data.videos,
      });

    } catch (err) {
      return res.status(500).json({ status: false, error: err.message });
    }
  });

  /**
   * GET /nsfw/rule34video/detail?url=https://rule34video.com/videos/xxx/
   * Detail video — ambil video source, tags, categories
   */
  app.get('/nsfw/rule34video/detail', async (req, res) => {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({
        status: false,
        message: "Parameter 'url' wajib diisi. Contoh: /nsfw/rule34video/detail?url=https://rule34video.com/videos/xxx/",
      });
    }

    try {
      const targetUrl = url.startsWith('http') ? url : BASE_URL + url;
      const html = await fetchHtml(targetUrl, BASE_URL + '/');
      const data = parseDetail(html);

      return res.json({
        status:       true,
        url:          targetUrl,
        title:        data.title,
        video_source: data.video_source,
        thumbnail:    data.thumbnail,
        duration:     data.duration,
        views:        data.views,
        description:  data.description,
        tags:         data.tags,
        categories:   data.categories,
      });

    } catch (err) {
      return res.status(500).json({ status: false, error: err.message });
    }
  });

};
