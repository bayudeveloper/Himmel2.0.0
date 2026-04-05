const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

// Register font
GlobalFonts.registerFromPath(
    path.join(__dirname, '../../../Inter_28pt-Regular.ttf'),
    'BratFont'
);

// ── Pure JS GIF Encoder (tanpa library eksternal) ─────────────────────────────
// Implements GIF89a spec — support palette 256 warna + LZW compression

class GifEncoder {
    constructor(width, height) {
        this.width    = width;
        this.height   = height;
        this.frames   = [];
        this.repeat   = 0;     // 0 = loop forever
        this.quality  = 10;
    }

    addFrame(imageData, delay = 100) {
        // imageData: Uint8ClampedArray [R,G,B,A, R,G,B,A, ...]
        this.frames.push({ imageData, delay });
    }

    encode() {
        const bufs = [];

        // GIF Header
        bufs.push(Buffer.from('GIF89a'));

        // Logical Screen Descriptor
        const lsd = Buffer.alloc(7);
        lsd.writeUInt16LE(this.width,  0);
        lsd.writeUInt16LE(this.height, 2);
        lsd.writeUInt8(0xF7, 4); // Global color table flag + 256 colors
        lsd.writeUInt8(0,    5); // Background color index
        lsd.writeUInt8(0,    6); // Pixel aspect ratio
        bufs.push(lsd);

        // Global Color Table — simple web-safe 256 palette (black + white utama)
        const palette = this._buildPalette();
        bufs.push(palette);

        // Netscape Application Extension (looping)
        bufs.push(Buffer.from([
            0x21, 0xFF, 0x0B,
            ...Buffer.from('NETSCAPE2.0'),
            0x03, 0x01,
            this.repeat & 0xFF, (this.repeat >> 8) & 0xFF,
            0x00
        ]));

        // Encode each frame
        for (const frame of this.frames) {
            bufs.push(this._encodeFrame(frame.imageData, frame.delay));
        }

        // GIF Trailer
        bufs.push(Buffer.from([0x3B]));

        return Buffer.concat(bufs);
    }

    _buildPalette() {
        // 256 entry palette — grayscale gradient + key colors
        const buf = Buffer.alloc(256 * 3);
        for (let i = 0; i < 256; i++) {
            buf[i * 3]     = i; // R
            buf[i * 3 + 1] = i; // G
            buf[i * 3 + 2] = i; // B
        }
        // index 0 = black, index 255 = white
        return buf;
    }

    _quantize(imageData) {
        // Map each pixel ke grayscale index (0-255)
        const pixels = new Uint8Array(this.width * this.height);
        for (let i = 0; i < pixels.length; i++) {
            const r = imageData[i * 4];
            const g = imageData[i * 4 + 1];
            const b = imageData[i * 4 + 2];
            pixels[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        }
        return pixels;
    }

    _encodeFrame(imageData, delay) {
        const bufs = [];

        // Graphic Control Extension
        const gce = Buffer.alloc(8);
        gce[0] = 0x21; // Extension
        gce[1] = 0xF9; // Graphic Control Label
        gce[2] = 0x04; // Block size
        gce[3] = 0x00; // Disposal method
        gce.writeUInt16LE(delay, 4); // Delay in centiseconds
        gce[6] = 0x00; // Transparent color index
        gce[7] = 0x00; // Block terminator
        bufs.push(gce);

        // Image Descriptor
        const imd = Buffer.alloc(10);
        imd[0] = 0x2C;
        imd.writeUInt16LE(0,           1); // Left
        imd.writeUInt16LE(0,           3); // Top
        imd.writeUInt16LE(this.width,  5);
        imd.writeUInt16LE(this.height, 7);
        imd[9] = 0x00; // No local color table
        bufs.push(imd);

        // Image Data — LZW encode
        const pixels   = this._quantize(imageData);
        const lzwData  = this._lzwEncode(pixels, 8);
        bufs.push(Buffer.from([8])); // LZW minimum code size
        bufs.push(this._packSubBlocks(lzwData));
        bufs.push(Buffer.from([0x00])); // Block terminator

        return Buffer.concat(bufs);
    }

    _lzwEncode(pixels, minCodeSize) {
        const clearCode = 1 << minCodeSize;
        const eofCode   = clearCode + 1;
        let codeSize    = minCodeSize + 1;
        let maxCode     = 1 << codeSize;
        let table       = new Map();
        let nextCode    = eofCode + 1;

        const initTable = () => {
            table = new Map();
            for (let i = 0; i < clearCode; i++) table.set(String(i), i);
            nextCode = eofCode + 1;
            codeSize = minCodeSize + 1;
            maxCode  = 1 << codeSize;
        };

        const bits  = [];
        const emit  = (code) => {
            for (let i = 0; i < codeSize; i++) {
                bits.push((code >> i) & 1);
            }
        };

        initTable();
        emit(clearCode);

        let buf = String(pixels[0]);
        for (let i = 1; i < pixels.length; i++) {
            const next = buf + ',' + pixels[i];
            if (table.has(next)) {
                buf = next;
            } else {
                emit(table.get(buf));
                if (nextCode < 4096) {
                    table.set(next, nextCode++);
                    if (nextCode > maxCode && codeSize < 12) {
                        codeSize++;
                        maxCode = 1 << codeSize;
                    }
                }
                if (nextCode >= 4096) {
                    emit(clearCode);
                    initTable();
                }
                buf = String(pixels[i]);
            }
        }
        emit(table.get(buf));
        emit(eofCode);

        // Pack bits into bytes
        const bytes = [];
        for (let i = 0; i < bits.length; i += 8) {
            let byte = 0;
            for (let j = 0; j < 8 && i + j < bits.length; j++) {
                byte |= (bits[i + j] << j);
            }
            bytes.push(byte);
        }
        return bytes;
    }

    _packSubBlocks(data) {
        const bufs = [];
        let i = 0;
        while (i < data.length) {
            const blockSize = Math.min(255, data.length - i);
            bufs.push(Buffer.from([blockSize]));
            bufs.push(Buffer.from(data.slice(i, i + blockSize)));
            i += blockSize;
        }
        return Buffer.concat(bufs);
    }
}

// ── Brat frame renderer ───────────────────────────────────────────────────────
function renderBratFrame(ctx, canvas, words, size) {
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

// ── Route ─────────────────────────────────────────────────────────────────────
module.exports = function(app) {
    app.get('/tools/bratvideo', (req, res) => {
        const text = String(req.query.text || '').trim();
        if (!text) {
            return res.status(400).json({ status: false, message: 'Masukkan parameter ?text=' });
        }

        const dur   = Math.min(Math.max(parseFloat(req.query.dur) || 0.6, 0.2), 2.0);
        const size  = 400;
        const delay = Math.round(dur * 100); // centiseconds
        const words = text.split(/\s+/).filter(Boolean);

        try {
            const gif    = new GifEncoder(size, size);
            const canvas = createCanvas(size, size);
            const ctx    = canvas.getContext('2d');

            // Frame 1: blank selama 1 detik
            renderBratFrame(ctx, canvas, [], size);
            gif.addFrame(canvas.data || ctx.getImageData(0, 0, size, size).data, 100);

            // Frame tiap kata akumulasi
            const acc = [];
            for (const word of words) {
                acc.push(word);
                renderBratFrame(ctx, canvas, [...acc], size);
                gif.addFrame(canvas.data || ctx.getImageData(0, 0, size, size).data, delay);
            }

            // Frame terakhir tahan 2 detik
            renderBratFrame(ctx, canvas, [...acc], size);
            gif.addFrame(canvas.data || ctx.getImageData(0, 0, size, size).data, 200);

            const gifBuffer = gif.encode();

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
