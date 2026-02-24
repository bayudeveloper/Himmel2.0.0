const { cfGet } = require('../../lib/cfBypass');

module.exports = function(app) {
    /**
     * GET /tools/qrcode?text=hello&size=300&color=000000&bg=ffffff
     * Returns QR Code image (PNG)
     */
    app.get('/tools/qrcode', async (req, res) => {
        const { text, size = '300', color = '000000', bg = 'ffffff' } = req.query;

        if (!text) {
            return res.status(400).json({
                status: false,
                message: "Parameter 'text' wajib diisi! Contoh: /tools/qrcode?text=https://example.com"
            });
        }

        try {
            // Gunakan goqr.me API — reliable & gratis
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(text)}&size=${size}x${size}&color=${color}&bgcolor=${bg}&format=png&margin=10`;

            const response = await cfGet(qrUrl, {
                responseType: 'arraybuffer',
                timeout: 15000
            });

            res.set({
                'Content-Type': 'image/png',
                'Content-Length': response.data.length,
                'Cache-Control': 'public, max-age=3600'
            });
            res.send(Buffer.from(response.data));

        } catch (err) {
            // Fallback: return JSON with URL kalau gambar gagal
            try {
                const fallbackUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(text)}&size=${size}x${size}`;
                res.json({
                    status: true,
                    qr_url: fallbackUrl,
                    text,
                    note: 'Direct image failed, use qr_url instead'
                });
            } catch {
                res.status(500).json({ status: false, error: err.message });
            }
        }
    });
};
