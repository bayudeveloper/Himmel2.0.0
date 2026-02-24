const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

GlobalFonts.registerFromPath(
    path.join(__dirname, 'Inter_28pt-Regular.ttf'),
    'CustomFont'
);

module.exports = function(app) {
    function generateBrat(text, size = 1080) {
        try {
            const canvas = createCanvas(size, size);
            const ctx = canvas.getContext("2d");

            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, size, size);

            let fontSize = Math.floor(size / 6);
            ctx.font = `${fontSize}px CustomFont`;
            ctx.fillStyle = "#000000";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            // Word wrap
            const maxWidth = size * 0.85;
            const words = text.split(' ');
            const lines = [];
            let currentLine = '';

            for (const word of words) {
                const testLine = currentLine ? `${currentLine} ${word}` : word;
                const { width } = ctx.measureText(testLine);
                if (width > maxWidth && currentLine) {
                    lines.push(currentLine);
                    currentLine = word;
                } else {
                    currentLine = testLine;
                }
            }
            if (currentLine) lines.push(currentLine);

            const lineHeight = fontSize * 1.2;
            const totalHeight = lines.length * lineHeight;
            const startY = (size - totalHeight) / 2 + lineHeight / 2;

            for (let i = 0; i < lines.length; i++) {
                ctx.fillText(lines[i], size / 2, startY + i * lineHeight);
            }

            return canvas.toBuffer("image/png");

        } catch (err) {
            console.error("Brat generator error:", err);
            throw new Error("Gagal generate gambar brat");
        }
    }

    app.get("/tools/brat", (req, res) => {
        const text = req.query.text;

        if (!text) {
            return res.status(400).json({
                status: false,
                message: "Masukkan parameter ?text="
            });
        }

        try {
            const image = generateBrat(text);

            res.set({
                "Content-Type": "image/png",
                "Content-Disposition": `inline; filename="brat.png"`,
                "Content-Length": image.length,
                "Cache-Control": "no-cache"
            });

            res.send(image);

        } catch (err) {
            res.status(500).json({
                status: false,
                error: err.message
            });
        }
    });
};
