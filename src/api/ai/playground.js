/**
 * /ai/playground — proxy endpoint untuk hero playground di portofolio.html
 * API key di-inject dari settings.json, tidak perlu dikirim dari client.
 */

const path = require('path');
const fs   = require('fs');
const axios = require('axios');

module.exports = (app) => {
    app.get('/ai/playground', async (req, res) => {
        const { q } = req.query;
        if (!q || !q.trim()) {
            return res.status(400).json({ status: false, error: 'Parameter q wajib diisi.' });
        }

        // Ambil API key pertama dari settings.json
        let apiKey = '';
        try {
            const settingsPath = path.join(__dirname, '../../settings.json');
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
            const keys = settings?.apiSettings?.apiKeys?.keys;
            if (Array.isArray(keys) && keys.length > 0) {
                apiKey = keys[0].key;
            }
        } catch (_) {}

        if (!apiKey) {
            return res.status(500).json({ status: false, error: 'API key tidak ditemukan di server.' });
        }

        try {
            const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
            const response = await axios.get(`${baseUrl}/ai/chat`, {
                params: { q: q.trim(), apikey: apiKey },
                timeout: 30000
            });
            return res.json(response.data);
        } catch (err) {
            const msg = err?.response?.data?.error || err.message || 'Gagal menghubungi AI.';
            return res.status(500).json({ status: false, error: msg });
        }
    });
};
