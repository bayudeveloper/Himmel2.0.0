const axios  = require('axios');
const https  = require('https');
const zlib   = require('zlib');
const urlLib = require('url');
const { HttpsProxyAgent } = require('https-proxy-agent');

const BASE_URL = 'https://hentai-cosplay-xxx.com';

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

function makeAxios() {
  const proxyUrl = getProxy();
  return axios.create({
    httpsAgent: new HttpsProxyAgent(proxyUrl),
    proxy: false,
    timeout: 30000,
    maxRedirects: 5,
    headers: {
      'User-Agent':                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
      'Accept':                    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language':           'en-US,en;q=0.9',
      'Accept-Encoding':           'gzip, deflate, br',
      'Cache-Control':             'max-age=0',
      'sec-ch-ua':                 '"Chromium";v="139", "Not;A=Brand";v="99"',
      'sec-ch-ua-mobile':          '?0',
      'sec-ch-ua-platform':        '"Linux"',
      'sec-fetch-dest':            'document',
      'sec-fetch-mode':            'navigate',
      'sec-fetch-site':            'none',
      'Upgrade-Insecure-Requests': '1',
    },
    responseType: 'arraybuffer',
  });
}

async function fetchHtml(url, referer = BASE_URL + '/') {
  let retries = PROXIES.length;
  let lastErr;
  while (retries-- > 0) {
    try {
      const instance = makeAxios();
      instance.defaults.headers['Referer'] = referer;
      const res = await instance.get(url);
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
    }
  }
  throw lastErr;
}

// ── Parser search ─────────────────────────────────────────────────────────────
function parseSearch(html) {
  const results = [];
  const totalMatch = html.match(/class="immoral_all_items">(\d+)<\/span>/);
  const total = totalMatch ? parseInt(totalMatch[1]) : 0;

  for (const block of html.split('<li>')) {
    if (!block.includes('image-list-item')) continue;
    const hrefMatch  = block.match(/href="(\/image\/[^"]+)"/);
    if (!hrefMatch) continue;
    const imgMatch   = block.match(/<img src="(https?:\/\/[^"]+)"/);
    const titleMatch = block.match(/image-list-item-title">\s*<a[^>]*>([^<]+)<\/a>/);
    const dateMatch  = block.match(/image-list-item-regist-date">\s*<span>([^<]+)<\/span>/);
    results.push({
      title:     titleMatch ? titleMatch[1].trim() : null,
      thumbnail: imgMatch   ? imgMatch[1] : null,
      url:       BASE_URL + hrefMatch[1],
      path:      hrefMatch[1],
      date:      dateMatch  ? dateMatch[1].trim() : null,
    });
  }
  return { total, results };
}

// ── Parser detail — hanya array URL full-size .webp/.jpg ──────────────────────
function parseDetail(html) {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const title = titleMatch ? titleMatch[1].replace(' - Hentai Cosplay', '').trim() : null;

  const images = [];
  const aRe = /href="(https?:\/\/static\d+\.hentai-cosplay-xxx\.com\/upload\/[^"]+\.\w+)"\s+data-modal-gallery-image-item/g;
  let m;
  while ((m = aRe.exec(html)) !== null) {
    if (!m[1].includes('/p=')) images.push(m[1]);
  }

  return { title, imageCount: images.length, images };
}

// ── Route registration ────────────────────────────────────────────────────────
module.exports = function(app) {

  /**
   * GET /nsfw/hentaicosplay/search?q=nahida&page=1
   * Search hentai-cosplay-xxx.com
   */
  app.get('/nsfw/hentaicosplay/search', async (req, res) => {
    const { q, page = 1 } = req.query;

    if (!q) {
      return res.status(400).json({
        status: false,
        message: "Parameter 'q' wajib diisi. Contoh: /nsfw/hentaicosplay/search?q=nahida",
      });
    }

    try {
      const pageNum = parseInt(page) || 1;
      const path = pageNum > 1
        ? `/search/keyword/${encodeURIComponent(q)}/page/${pageNum}/`
        : `/search/keyword/${encodeURIComponent(q)}/`;

      const html = await fetchHtml(BASE_URL + path);
      const data = parseSearch(html);

      return res.json({
        status: true,
        query:    q,
        page:     pageNum,
        total:    data.total,
        count:    data.results.length,
        results:  data.results,
      });

    } catch (err) {
      return res.status(500).json({ status: false, error: err.message });
    }
  });

  /**
   * GET /nsfw/hentaicosplay/detail?path=/image/slug/
   * Detail halaman — kembalikan array gambar full-size
   */
  app.get('/nsfw/hentaicosplay/detail', async (req, res) => {
    const { path } = req.query;

    if (!path) {
      return res.status(400).json({
        status: false,
        message: "Parameter 'path' wajib diisi. Contoh: /nsfw/hentaicosplay/detail?path=/image/slug-nya/",
      });
    }

    try {
      const targetUrl = path.startsWith('http') ? path : BASE_URL + (path.startsWith('/') ? path : '/' + path);
      const html = await fetchHtml(targetUrl, BASE_URL + '/');
      const data = parseDetail(html);

      return res.json({
        status:     true,
        title:      data.title,
        url:        targetUrl,
        imageCount: data.imageCount,
        images:     data.images,
      });

    } catch (err) {
      return res.status(500).json({ status: false, error: err.message });
    }
  });

};
