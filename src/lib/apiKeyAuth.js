/**
 * ╔══════════════════════════════════════════╗
 * ║          API Key Auth Middleware         ║
 * ║  Baca dari settings.json — mudah kelola  ║
 * ╚══════════════════════════════════════════╝
 *
 * Cara kirim API key (salah satu):
 *   ?apikey=M0NPI
 *   Header: x-api-key: M0NPI
 *   Header: Authorization: Bearer M0NPI
 */

const fs   = require('fs');
const path = require('path');

// Load settings fresh setiap kali (support hot-reload tanpa restart server)
function getSettings() {
    try {
        const raw = fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf-8');
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

/**
 * Ambil API key dari request (query / header)
 */
function extractKey(req) {
    // Priority: query > x-api-key header > Authorization Bearer
    if (req.query.apikey)                              return req.query.apikey;
    if (req.headers['x-api-key'])                      return req.headers['x-api-key'];
    const auth = req.headers['authorization'] || '';
    if (auth.toLowerCase().startsWith('bearer '))      return auth.slice(7).trim();
    return null;
}

/**
 * Middleware: wajib API key untuk akses endpoint tertentu
 * @param {string} accessGroup  - grup akses yang diperlukan (misal: "ai")
 */
function requireApiKey(accessGroup = 'ai') {
    return function (req, res, next) {
        const settings = getSettings();
        const apikeyConfig = settings.apiSettings?.apiKeys;

        // Kalau fitur apikey dinonaktifkan di settings, langsung lanjut
        if (!apikeyConfig?.enabled) return next();

        const keys = apikeyConfig.keys || [];
        const submittedKey = extractKey(req);

        // Tidak ada key dikirim
        if (!submittedKey) {
            return res.status(401).json({
                status: false,
                error: 'unauthorized',
                message: 'Endpoint ini membutuhkan API Key.',
                hint: 'Kirim key lewat: ?apikey=KEY atau header x-api-key: KEY'
            });
        }

        // Cek key valid
        const matchedKey = keys.find(k => k.key === submittedKey);
        if (!matchedKey) {
            return res.status(403).json({
                status: false,
                error: 'forbidden',
                message: 'API Key tidak valid atau tidak ditemukan.'
            });
        }

        // Cek akses group (kalau key punya access array, cek apakah punya izin)
        if (matchedKey.access && !matchedKey.access.includes(accessGroup) && !matchedKey.access.includes('all')) {
            return res.status(403).json({
                status: false,
                error: 'forbidden',
                message: `API Key ini tidak memiliki akses ke endpoint '${accessGroup}'.`
            });
        }

        // Key valid — simpan info key di req untuk keperluan logging
        req.apiKey = { key: submittedKey, label: matchedKey.label, access: matchedKey.access };
        next();
    };
}

module.exports = { requireApiKey, extractKey };
