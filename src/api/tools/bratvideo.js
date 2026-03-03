const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const { execFile } = require('child_process');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

GlobalFonts.registerFromPath(
    path.join(__dirname, '../../../Inter_28pt-Regular.ttf'),
    'BratFont'
);

module.exports = function(app) {

    function renderFrame(words, size) {
        const canvas = createCanvas(size, size);
        const ctx    = canvas.getContext('2d');

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, size, size);

        if (!words.length) return canvas.toBuffer('image/png');

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

        return canvas.toBuffer('image/png');
    }

    app.get('/tools/bratvideo', (req, res) => {
        const text = String(req.query.text || '').trim();
        if (!text) {
            return res.status(400).json({ status: false, message: 'Masukkan parameter ?text=' });
        }

        const dur    = Math.min(Math.max(parseFloat(req.query.dur) || 0.6, 0.2), 2.0);
        const size   = 720; // lebih kecil = lebih cepat encode
        const fps    = 24;
        const hold   = Math.round(dur * fps);
        const words  = text.split(/\s+/).filter(Boolean);
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brat_'));
        const outFile = path.join(os.tmpdir(), `brat_${Date.now()}.mp4`);

        try {
            let idx = 0;

            // 1 detik blank di awal
            const blank = renderFrame([], size);
            for (let f = 0; f < fps; f++) {
                fs.writeFileSync(path.join(tmpDir, `f${String(idx++).padStart(6,'0')}.png`), blank);
            }

            // Tiap kata akumulasi
            const acc = [];
            for (const word of words) {
                acc.push(word);
                const buf = renderFrame([...acc], size);
                for (let f = 0; f < hold; f++) {
                    fs.writeFileSync(path.join(tmpDir, `f${String(idx++).padStart(6,'0')}.png`), buf);
                }
            }

            // 2 detik frame terakhir
            const last = renderFrame([...acc], size);
            for (let f = 0; f < fps * 2; f++) {
                fs.writeFileSync(path.join(tmpDir, `f${String(idx++).padStart(6,'0')}.png`), last);
            }

        } catch (frameErr) {
            cleanup(tmpDir, outFile);
            console.error('[bratvideo] frame error:', frameErr);
            return res.status(500).json({ status: false, error: 'Frame render failed: ' + frameErr.message });
        }

        // Encode async dengan execFile
        const ffArgs = [
            '-y',
            '-framerate', String(fps),
            '-i', path.join(tmpDir, 'f%06d.png'),
            '-vf', `scale=${size}:${size}:flags=lanczos,format=yuv420p`,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-movflags', '+faststart',
            outFile
        ];

        execFile('ffmpeg', ffArgs, { timeout: 90000 }, (err, stdout, stderr) => {
            if (err) {
                cleanup(tmpDir, outFile);
                console.error('[bratvideo] ffmpeg error:', stderr || err.message);
                return res.status(500).json({ status: false, error: 'ffmpeg failed: ' + (stderr || err.message) });
            }
            try {
                const buf = fs.readFileSync(outFile);
                res.set({
                    'Content-Type':        'video/mp4',
                    'Content-Disposition': 'inline; filename="brat.mp4"',
                    'Content-Length':      buf.length,
                    'Cache-Control':       'no-cache'
                });
                res.send(buf);
            } catch (readErr) {
                res.status(500).json({ status: false, error: 'Read output failed: ' + readErr.message });
            } finally {
                cleanup(tmpDir, outFile);
            }
        });
    });

    function cleanup(dir, file) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch(e) {}
        try { fs.unlinkSync(file); } catch(e) {}
    }
};
