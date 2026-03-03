const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

GlobalFonts.registerFromPath(
    path.join(__dirname, '../../../Inter_28pt-Regular.ttf'),
    'BratFont'
);

module.exports = function(app) {

    function generateBrat(text, size) {
        size = size || 1080;
        const canvas = createCanvas(size, size);
        const ctx    = canvas.getContext('2d');

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, size, size);

        let fontSize = Math.floor(size / 6);
        ctx.font         = `${fontSize}px "BratFont"`;
        ctx.fillStyle    = '#000000';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        // Word wrap
        const maxWidth = size * 0.85;
        const words    = text.split(' ');
        const lines    = [];
        let cur        = '';

        for (const word of words) {
            const test = cur ? `${cur} ${word}` : word;
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
            ctx.font = `${fontSize}px "BratFont"`;
        }

        const lineHeight  = fontSize * 1.25;
        const totalHeight = lines.length * lineHeight;
        const startY      = (size - totalHeight) / 2 + lineHeight / 2;

        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], size / 2, startY + i * lineHeight);
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
            console.error('[brat] error:', err);
            res.status(500).json({ status: false, error: err.message });
        }
    });
};
