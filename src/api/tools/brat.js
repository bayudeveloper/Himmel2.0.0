const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const https = require('https');
const path  = require('path');
const fs    = require('fs');
const os    = require('os');

// ── Font: Arimo Regular dari Google Fonts (TTF langsung) ─────────────────────
// URL static Google Fonts CDN — tidak perlu key, tidak redirect
const FONT_URL  = 'https://fonts.gstatic.com/s/arimo/v29/P5sfzZCDf9_T_3cV7NCUECyoxNk37cxsBxDAVQI4aA.ttf';
const FONT_PATH = path.join(os.tmpdir(), 'himmel_brat_font.ttf');

let fontName = 'sans-serif';

function downloadFont() {
    return new Promise((resolve) => {
        // Sudah ada dan cukup besar → skip
        if (fs.existsSync(FONT_PATH) && fs.statSync(FONT_PATH).size > 50000) {
            try {
                GlobalFonts.registerFromPath(FONT_PATH, 'BratFont');
                fontName = 'BratFont';
                console.log('[brat] Font loaded from cache');
            } catch(e) {}
            return resolve();
        }
        const file = fs.createWriteStream(FONT_PATH);
        const req  = https.get(FONT_URL, (res) => {
            res.pipe(file);
            file.on('finish', () => {
                file.close();
                try {
                    GlobalFonts.registerFromPath(FONT_PATH, 'BratFont');
                    fontName = 'BratFont';
                    console.log('[brat] Font downloaded & registered OK');
                } catch(e) {
                    console.warn('[brat] Font register failed:', e.message);
                }
                resolve();
            });
        });
        req.on('error', (e) => {
            console.warn('[brat] Font download failed:', e.message);
            fs.unlink(FONT_PATH, () => {});
            resolve(); // tidak crash, fallback ke sans-serif
        });
        req.setTimeout(8000, () => {
            req.destroy();
            console.warn('[brat] Font download timeout');
            resolve();
        });
    });
}

// Download di background saat server start
downloadFont();

// ── Brat Generator ────────────────────────────────────────────────────────────
module.exports = function(app) {

    function generateBrat(text, size) {
        size = size || 1080;
        const canvas = createCanvas(size, size);
        const ctx    = canvas.getContext('2d');

        // Background putih
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, size, size);

        // Font size awal
        let fontSize = Math.floor(size / 6);
        ctx.font         = `${fontSize}px "${fontName}"`;
        ctx.fillStyle    = '#000000';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        // Word wrap
        const maxWidth = size * 0.85;
        const words    = text.split(' ');
        const lines    = [];
        let cur        = '';

        for (var i = 0; i < words.length; i++) {
            var word = words[i];
            var test = cur ? cur + ' ' + word : word;
            if (ctx.measureText(test).width > maxWidth && cur) {
                lines.push(cur);
                cur = word;
            } else {
                cur = test;
            }
        }
        if (cur) lines.push(cur);

        // Kecilkan font kalau banyak baris
        if (lines.length > 4) {
            fontSize = Math.floor(fontSize * (4 / lines.length));
            ctx.font = `${fontSize}px "${fontName}"`;
        }

        const lineHeight  = fontSize * 1.25;
        const totalHeight = lines.length * lineHeight;
        const startY      = (size - totalHeight) / 2 + lineHeight / 2;

        for (var j = 0; j < lines.length; j++) {
            ctx.fillText(lines[j], size / 2, startY + j * lineHeight);
        }

        return canvas.toBuffer('image/png');
    }

    app.get('/tools/brat', (req, res) => {
        const text = String(req.query.text || '').trim();
        if (!text) {
            return res.status(400).json({ status: false, message: 'Masukkan parameter ?text=' });
        }
        try {
            const img = generateBrat(text);
            res.set({
                'Content-Type':        'image/png',
                'Content-Disposition': 'inline; filename="brat.png"',
                'Content-Length':      img.length,
                'Cache-Control':       'no-cache'
            });
            res.send(img);
        } catch (err) {
            console.error('[brat] generate error:', err);
            res.status(500).json({ status: false, error: err.message });
        }
    });
};
