/**
 * ╔═══════════════════════════════════════════╗
 * ║        Cloudflare Bypass Utility          ║
 * ║   Kredibilitas & Stabilitas Tinggi        ║
 * ╚═══════════════════════════════════════════╝
 */

const axios = require('axios');

// Pool User-Agent yang realistis dan up-to-date
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
];

// Pilih UA secara acak
function getRandomUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Generate headers bypass CF yang lengkap
function getCFBypassHeaders(referer = null, extra = {}) {
    const ua = getRandomUA();
    const headers = {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'Sec-Ch-Ua-Mobile': ua.includes('Mobile') ? '?1' : '?0',
        'Sec-Ch-Ua-Platform': ua.includes('Android') || ua.includes('iPhone') ? '"Android"' : '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': referer ? 'same-origin' : 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'DNT': '1',
        ...extra
    };
    if (referer) headers['Referer'] = referer;
    return headers;
}

// Headers untuk AJAX/API request bypass CF
function getCFApiHeaders(origin = null, referer = null, extra = {}) {
    const ua = getRandomUA();
    const headers = {
        'User-Agent': ua,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'DNT': '1',
        ...extra
    };
    if (origin) headers['Origin'] = origin;
    if (referer) headers['Referer'] = referer;
    return headers;
}

/**
 * Request dengan retry logic + CF bypass
 * @param {object} config - axios config
 * @param {number} retries - jumlah retry (default 3)
 * @param {number} delay - delay antar retry ms (default 1000)
 */
async function cfRequest(config, retries = 3, delay = 1000) {
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            // Rotate UA setiap attempt
            if (!config.headers) config.headers = {};
            if (!config.headers['User-Agent']) {
                config.headers['User-Agent'] = getRandomUA();
            }
            
            // Timeout default 30 detik
            if (!config.timeout) config.timeout = 30000;

            const response = await axios(config);
            return response;
        } catch (err) {
            lastError = err;
            const status = err.response?.status;

            // Jangan retry jika 4xx (kecuali 429 = rate limit)
            if (status && status >= 400 && status < 500 && status !== 429) {
                throw err;
            }

            // CF challenge (403, 503)
            if (status === 403 || status === 503) {
                console.warn(`[CF Bypass] Attempt ${attempt}/${retries} blocked (${status}), retrying...`);
                // Ganti UA untuk attempt berikutnya
                config.headers['User-Agent'] = getRandomUA();
            }

            if (attempt < retries) {
                // Exponential backoff
                await new Promise(r => setTimeout(r, delay * attempt));
            }
        }
    }
    throw lastError;
}

/**
 * GET dengan CF bypass
 */
async function cfGet(url, options = {}) {
    const { referer, extra, retries, delay, ...axiosExtra } = options;
    return cfRequest({
        method: 'GET',
        url,
        headers: getCFBypassHeaders(referer, extra),
        ...axiosExtra
    }, retries, delay);
}

/**
 * POST dengan CF bypass
 */
async function cfPost(url, data, options = {}) {
    const { origin, referer, extra, retries, delay, ...axiosExtra } = options;
    return cfRequest({
        method: 'POST',
        url,
        data,
        headers: getCFApiHeaders(origin, referer, extra),
        ...axiosExtra
    }, retries, delay);
}

module.exports = {
    getRandomUA,
    getCFBypassHeaders,
    getCFApiHeaders,
    cfRequest,
    cfGet,
    cfPost
};
