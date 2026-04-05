const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const GIFEncoder = require('gif-encoder-2');
const path = require('path');

GlobalFonts.registerFromPath(
    path.join(__dirname, '../../../Inter_28pt-Regular.ttf'),
    'BratFont'
);

// ── Render satu frame brat ke canvas ─────────────────────────────────────────
function renderFrame(ctx, words, size) {
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
            if (ctx.measureText(test).width > maxWidth && cur) {
                ls.push(cur); cur = w;
            } else cur = test;
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

// ── Ambil pixel data dari canvas @napi-rs ─────────────────────────────────────
// @napi-rs/canvas toBuffer('raw') return BGRA — gif-encoder-2 butuh RGBA
function getPixels(canvas, ctx, size) {
    // Coba toBuffer('raw') dulu — paling efisien
    try {
        const raw = canvas.toBuffer('raw'); // BGRA format di @napi-rs
        // Swap B dan R (BGRA → RGBA)
        const rgba = Buffer.alloc(raw.length);
        for (let i = 0; i < raw.length; i += 4) {
            rgba[i]     = raw[i + 2]; // R ← B
            rgba[i + 1] = raw[i + 1]; // G
            rgba[i + 2] = raw[i];     // B ← R
            rgba[i + 3] = raw[i + 3]; // A
        }
        return rgba;
    } catch {
        // Fallback: getImageData
        const imageData = ctx.getImageData(0, 0, size, size);
        return Buffer.from(imageData.data);
    }
}

// ── Route ─────────────────────────────────────────────────────────────────────
module.exports = function(app) {
    app.get('/tools/bratvideo', async (req, res) => {
        const text = String(req.query.text || '').trim();
        if (!text) {
            return res.status(400).json({ status: false, message: 'Masukkan parameter ?text=' });
        }

        const dur   = Math.min(Math.max(parseFloat(req.query.dur) || 0.6, 0.2), 2.0);
        const size  = 400;
        const delay = Math.round(dur * 1000); // milliseconds untuk gif-encoder-2
        const words = text.split(/\s+/).filter(Boolean);

        try {
            const encoder = new GIFEncoder(size, size, 'neuquant', true);
            encoder.setDelay(delay);
            encoder.setRepeat(0);
            encoder.setQuality(10);
            encoder.start();

            const canvas = createCanvas(size, size);
            const ctx    = canvas.getContext('2d');

            // Frame 1: blank 1 detik
            encoder.setDelay(1000);
            renderFrame(ctx, [], size);
            encoder.addFrame(getPixels(canvas, ctx, size));

            // Frame tiap kata akumulasi
            encoder.setDelay(delay);
            const acc = [];
            for (const word of words) {
                acc.push(word);
                renderFrame(ctx, [...acc], size);
                encoder.addFrame(getPixels(canvas, ctx, size));
            }

            // Frame terakhir tahan 2 detik
            encoder.setDelay(2000);
            renderFrame(ctx, [...acc], size);
            encoder.addFrame(getPixels(canvas, ctx, size));

            encoder.finish();

            const gifBuffer = encoder.out.getData();

            res.set({
                'Content-Type':        'image/gif',
                'Content-Disposition': 'inline; filename="brat.gif"',
                'Content-Length':      gifBuffer.length,
                'Cache-Control':       'no-cache',
            });
            return res.send(gifBuffer);

        } catch (err) {
            console.error('[bratvideo] error:', err.message, err.stack);
            return res.status(500).json({ status: false, error: err.message });
        }
    });
};
