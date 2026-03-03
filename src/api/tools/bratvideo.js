const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const { execSync } = require('child_process');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

GlobalFonts.registerFromPath(
    path.join(__dirname, '../../../Inter_28pt-Regular.ttf'),
    'BratFont'
);

module.exports = function(app) {

    // ── Helper: render satu frame dengan N kata ──────────────
    function renderFrame(words, size) {
        const canvas = createCanvas(size, size);
        const ctx    = canvas.getContext('2d');

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, size, size);

        if (!words.length) return canvas.toBuffer('image/png');

        const text     = words.join(' ');
        const maxWidth = size * 0.82;
        const padding  = size * 0.09;

        // Cari ukuran font yang pas (dari besar ke kecil)
        let fontSize = Math.floor(size / 5);
        const minFont = Math.floor(size / 22);

        function getLines(fSize) {
            ctx.font = `${fSize}px "BratFont"`;
            const ws = text.split(' ');
            const ls = [];
            let cur  = '';
            for (const w of ws) {
                const test = cur ? `${cur} ${w}` : w;
                if (ctx.measureText(test).width > maxWidth && cur) { ls.push(cur); cur = w; }
                else cur = test;
            }
            if (cur) ls.push(cur);
            return ls;
        }

        // Shrink font sampai semua muat dalam canvas
        while (fontSize > minFont) {
            const lines      = getLines(fontSize);
            const lineHeight = fontSize * 1.3;
            const totalH     = lines.length * lineHeight;
            if (totalH <= size - padding * 2) break;
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

        return canvas.toBuffer('image/png');
    }

    // ── Route ────────────────────────────────────────────────
    app.get('/tools/bratvideo', async (req, res) => {
        const text = String(req.query.text || '').trim();
        if (!text) {
            return res.status(400).json({ status: false, message: 'Masukkan parameter ?text=' });
        }

        // Durasi tiap frame dalam detik (default 0.6s)
        const dur  = Math.min(Math.max(parseFloat(req.query.dur) || 0.6, 0.2), 2.0);
        const size = 1080;
        const fps  = 30;
        const hold = Math.round(dur * fps); // frame per kata

        const words   = text.split(/\s+/).filter(Boolean);
        const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'brat_'));
        const outFile = path.join(os.tmpdir(), `brat_${Date.now()}.mp4`);

        try {
            let frameIndex = 0;

            // Frame kosong di awal (1 detik)
            const blankBuf = renderFrame([], size);
            for (let f = 0; f < fps; f++) {
                fs.writeFileSync(path.join(tmpDir, `f${String(frameIndex++).padStart(6,'0')}.png`), blankBuf);
            }

            // Tiap kata: render akumulasi dan hold beberapa frame
            const accumulated = [];
            for (const word of words) {
                accumulated.push(word);
                const buf = renderFrame([...accumulated], size);
                for (let f = 0; f < hold; f++) {
                    fs.writeFileSync(path.join(tmpDir, `f${String(frameIndex++).padStart(6,'0')}.png`), buf);
                }
            }

            // Frame terakhir tahan 2 detik
            const lastBuf = renderFrame([...accumulated], size);
            for (let f = 0; f < fps * 2; f++) {
                fs.writeFileSync(path.join(tmpDir, `f${String(frameIndex++).padStart(6,'0')}.png`), lastBuf);
            }

            // Encode ke MP4 pakai ffmpeg
            execSync(
                `ffmpeg -y -framerate ${fps} -i "${path.join(tmpDir, 'f%06d.png')}" ` +
                `-vf "scale=${size}:${size}:flags=lanczos,format=yuv420p" ` +
                `-c:v libx264 -preset fast -crf 23 -movflags +faststart "${outFile}"`,
                { stdio: 'pipe', timeout: 60000 }
            );

            const videoBuffer = fs.readFileSync(outFile);
            res.set({
                'Content-Type':        'video/mp4',
                'Content-Disposition': 'inline; filename="brat.mp4"',
                'Content-Length':      videoBuffer.length,
                'Cache-Control':       'no-cache'
            });
            res.send(videoBuffer);

        } catch (err) {
            console.error('[bratvideo] error:', err.message);
            res.status(500).json({ status: false, error: err.message });
        } finally {
            // Cleanup
            try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(e) {}
            try { fs.unlinkSync(outFile); } catch(e) {}
        }
    });
};
