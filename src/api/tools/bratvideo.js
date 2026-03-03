const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const GIFEncoder = require('gifencoder');
const path = require('path');

GlobalFonts.registerFromPath(
    path.join(__dirname, '../../../Inter_28pt-Regular.ttf'),
    'BratFont'
);

module.exports = function(app) {

    function renderFrame(ctx, canvas, words, size) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, size, size);

        if (!words.length) return;

        const text     = words.join(' ');
        const maxWidth = size * 0.82;
        const padding  = size * 0.09;

        function getLines(fSize) {
            ctx.font = `${fSize}px "BratFont"`;
            const ws = text.split(' ');
            const ls = []; let cur = '';
            for (const w of ws) {
                const test = cur ? `${cur} ${w}` : w;
                if (ctx.measureText(test).width > maxWidth && cur) { ls.push(cur); cur = w; }
                else cur = test;
            }
            if (cur) ls.push(cur);
            return ls;
        }

        let fontSize = Math.floor(size / 5);
        const minFont = Math.floor(size / 22);
        while (fontSize > minFont) {
            const lines = getLines(fontSize);
            if (lines.length * fontSize * 1.3 <= size - padding * 2) break;
            fontSize -= 2;
        }

        const lines      = getLines(fontSize);
        const lineHeight = fontSize * 1.3;
        const totalH     = lines.length * lineHeight;
        const startY     = (size - totalH) / 2 + lineHeight / 2;

        ctx.font         = `${fontSize}px "BratFont"`;
        ctx.fillStyle    = '#000000';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], size / 2, startY + i * lineHeight);
        }
    }

    app.get('/tools/bratvideo', (req, res) => {
        const text = String(req.query.text || '').trim();
        if (!text) {
            return res.status(400).json({ status: false, message: 'Masukkan parameter ?text=' });
        }

        const dur   = Math.min(Math.max(parseFloat(req.query.dur) || 0.6, 0.2), 2.0);
        const size  = 400; // GIF lebih kecil biar cepet
        const fps   = 10;
        const delay = Math.round(dur * 100); // GIF delay dalam centiseconds
        const words = text.split(/\s+/).filter(Boolean);

        try {
            const encoder = new GIFEncoder(size, size);
            const canvas  = createCanvas(size, size);
            const ctx     = canvas.getContext('2d');

            const chunks = [];
            encoder.createReadStream().on('data', chunk => chunks.push(chunk));

            encoder.start();
            encoder.setRepeat(0);   // 0 = loop forever
            encoder.setDelay(100);  // delay default 1 detik blank
            encoder.setQuality(10);

            // 1 detik blank di awal
            renderFrame(ctx, canvas, [], size);
            encoder.setDelay(100);
            encoder.addFrame(ctx);

            // Tiap kata akumulasi
            const acc = [];
            for (const word of words) {
                acc.push(word);
                renderFrame(ctx, canvas, [...acc], size);
                encoder.setDelay(delay * 10); // centiseconds
                encoder.addFrame(ctx);
            }

            // Tahan frame terakhir 2 detik
            renderFrame(ctx, canvas, [...acc], size);
            encoder.setDelay(200);
            encoder.addFrame(ctx);

            encoder.finish();

            const gifBuffer = Buffer.concat(chunks);

            res.set({
                'Content-Type':        'image/gif',
                'Content-Disposition': 'inline; filename="brat.gif"',
                'Content-Length':      gifBuffer.length,
                'Cache-Control':       'no-cache'
            });
            res.send(gifBuffer);

        } catch (err) {
            console.error('[bratvideo] error:', err.message);
            return res.status(500).json({ status: false, error: err.message });
        }
    });
};
