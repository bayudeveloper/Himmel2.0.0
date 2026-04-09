/**
 * [ Welcome Card Generator - V1 ]
 *  Endpoint:
 *    GET /api/tools/welcomev1?urlfoto=...&subject=...
 *
 *  Output: image/png
 */

const axios = require('axios');

// @napi-rs/canvas — sudah ada di package.json Himmel
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const BG_URL = 'https://ik.imagekit.io/bayuofficial/baground-v1.jpg';

// Dimensi canvas — sesuai foto referensi (landscape)
const W = 1366;
const H = 768;

async function fetchImage(url) {
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
        },
    });
    return Buffer.from(res.data);
}

async function generateWelcome(urlfoto, subject) {
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');

    // ── Background ─────────────────────────────────────────────────────────
    const bgBuf = await fetchImage(BG_URL);
    const bgImg = await loadImage(bgBuf);
    ctx.drawImage(bgImg, 0, 0, W, H);

    // ── Judul "Welcome" ────────────────────────────────────────────────────
    ctx.font         = 'bold 68px sans-serif';
    ctx.fillStyle    = '#3a3a3a';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Welcome', W / 2, 90);

    // ── Foto profil (lingkaran, center) ────────────────────────────────────
    const avatarSize   = 280;
    const avatarX      = W / 2;
    const avatarY      = H / 2 - 30;   // sedikit ke atas dari tengah
    const avatarRadius = avatarSize / 2;

    // Fetch & load avatar
    const avatarBuf = await fetchImage(urlfoto);
    const avatarImg = await loadImage(avatarBuf);

    // Clip lingkaran
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(
        avatarImg,
        avatarX - avatarRadius,
        avatarY - avatarRadius,
        avatarSize,
        avatarSize
    );
    ctx.restore();

    // Border lingkaran
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth   = 5;
    ctx.stroke();

    // ── Subject / username ─────────────────────────────────────────────────
    const textY = avatarY + avatarRadius + 70;

    // Shadow tipis biar terbaca di background terang
    ctx.shadowColor   = 'rgba(0,0,0,0.12)';
    ctx.shadowBlur    = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    ctx.font         = '52px sans-serif';
    ctx.fillStyle    = '#3a3a3a';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(subject, W / 2, textY);

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur  = 0;

    return canvas.toBuffer('image/png');
}

// ── Express Route ─────────────────────────────────────────────────────────────

module.exports = function(app) {

    /**
     * GET /api/tools/welcomev1?urlfoto=https://...&subject=@bayuofficial
     */
    app.get('/tools/welcomev1', async (req, res) => {
        const { urlfoto, subject } = req.query;

        if (!urlfoto || !subject) {
            return res.status(400).json({
                status:  false,
                message: 'Parameter ?urlfoto= dan ?subject= wajib diisi',
            });
        }

        try {
            const imgBuffer = await generateWelcome(urlfoto, subject);

            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Content-Disposition', 'inline; filename="welcome.png"');
            res.send(imgBuffer);

        } catch (err) {
            res.status(500).json({
                status:  false,
                message: 'Gagal generate gambar: ' + err.message,
            });
        }
    });

};
