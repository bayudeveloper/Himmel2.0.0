/**
 * ╔══════════════════════════════════════════════════════╗
 * ║         YouTube Downloader — ytdown.to               ║
 * ║  Endpoint: GET /downloader/ytdown?url=               ║
 * ║  Response: video (MP4) + audio (MP3/M4A/dll)         ║
 * ╚══════════════════════════════════════════════════════╝
 */

const axios = require('axios');

// ─── CONFIG ───────────────────────────────────────────────────────────────────

const BASE     = 'https://app.ytdown.to';
const ENDPOINT = `${BASE}/proxy.php`;
const REFERER  = `${BASE}/en23/`;
const UA       = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

async function getSession() {
    const res = await axios.get(REFERER, {
        headers: {
            'user-agent': UA,
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'accept-language': 'en-US,en;q=0.9',
        },
        maxRedirects: 5,
    });

    const setCookies = res.headers['set-cookie'] || [];
    if (setCookies.length === 0) throw new Error('Gagal mendapatkan session cookies');

    const cookieMap = {};
    for (const raw of setCookies) {
        const part = raw.split(';')[0].trim();
        const eqIdx = part.indexOf('=');
        if (eqIdx === -1) continue;
        cookieMap[part.substring(0, eqIdx).trim()] = part.substring(eqIdx + 1).trim();
    }

    return Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function fetchMedia(youtubeUrl, cookieStr) {
    const payload = new URLSearchParams({ url: youtubeUrl });

    const headers = {
        'authority': 'app.ytdown.to',
        'accept': '*/*',
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': 'en-US,en;q=0.9',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'cookie': cookieStr,
        'dnt': '1',
        'origin': BASE,
        'referer': REFERER,
        'sec-ch-ua': '"Chromium";v="139", "Not;A=Brand";v="99"',
        'sec-ch-ua-mobile': '?1',
        'sec-ch-ua-platform': '"Android"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': UA,
        'x-requested-with': 'XMLHttpRequest',
    };

    const { data } = await axios.post(ENDPOINT, payload.toString(), { headers });

    if (!data?.api || data.api.status !== 'ok') {
        throw new Error('Response error: ' + JSON.stringify(data?.api?.message || data));
    }

    return data.api;
}

function parseMedia(api) {
    const videos = api.mediaItems.filter(m => m.type === 'Video');
    const audios  = api.mediaItems.filter(m => m.type === 'Audio');

    return {
        title:     api.title,
        id:        api.id,
        duration:  api.mediaItems[0]?.mediaDuration || '-',
        thumbnail: api.imagePreviewUrl,
        uploader:  api.userInfo?.name || '-',
        videos: videos.map(m => ({
            quality:  m.mediaQuality,
            res:      m.mediaRes,
            size:     m.mediaFileSize,
            ext:      m.mediaExtension,
            task:     m.mediaTask,
            url:      m.mediaUrl,
        })),
        audios: audios.map(m => ({
            quality:  m.mediaQuality,
            size:     m.mediaFileSize,
            ext:      m.mediaExtension,
            task:     m.mediaTask,
            url:      m.mediaUrl,
        })),
    };
}

async function ytdown(youtubeUrl) {
    const cookieStr = await getSession();
    const api       = await fetchMedia(youtubeUrl, cookieStr);
    return parseMedia(api);
}

// ─── ROUTE ────────────────────────────────────────────────────────────────────

module.exports = function(app) {

    /**
     * GET /downloader/ytdown?url=<youtube_url>
     *
     * Response:
     * {
     *   status: true,
     *   data: {
     *     title, id, duration, thumbnail, uploader,
     *     videos: [{ quality, res, size, ext, task, url }],
     *     audios: [{ quality, size, ext, task, url }]
     *   }
     * }
     */
    app.get('/downloader/ytdown', async (req, res) => {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({
                status: false,
                message: 'Parameter ?url= wajib diisi. Contoh: ?url=https://youtu.be/xxx'
            });
        }

        // Validasi basic URL YouTube
        const isYT = /(?:youtube\.com|youtu\.be)/i.test(url);
        if (!isYT) {
            return res.status(400).json({
                status: false,
                message: 'URL tidak valid. Hanya mendukung link YouTube.'
            });
        }

        try {
            const data = await ytdown(url.trim());

            return res.json({
                status: true,
                data
            });

        } catch (err) {
            return res.status(500).json({
                status: false,
                error: err.message || 'Terjadi kesalahan saat memproses video'
            });
        }
    });

};
