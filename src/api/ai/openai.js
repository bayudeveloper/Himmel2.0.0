const axios = require('axios');
const { requireApiKey } = require('../../lib/apiKeyAuth');

// ─── Provider List (gratis, tanpa API key) ────────────────────────────────────
// Dicoba urut dari atas, kalau gagal lanjut ke berikutnya
const PROVIDERS = [

    // 1. Pollinations AI — gratis, no key, GPT-4o based
    async (message) => {
        const res = await axios.post('https://text.pollinations.ai/openai', {
            model: 'openai',
            messages: [{ role: 'user', content: message }]
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
        });
        const text = res.data?.choices?.[0]?.message?.content;
        if (!text) throw new Error('No response');
        return text;
    },

    // 2. Pollinations AI — model claude
    async (message) => {
        const res = await axios.post('https://text.pollinations.ai/openai', {
            model: 'claude',
            messages: [{ role: 'user', content: message }]
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
        });
        const text = res.data?.choices?.[0]?.message?.content;
        if (!text) throw new Error('No response');
        return text;
    },

    // 3. Pollinations simple text endpoint
    async (message) => {
        const res = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(message)}`, {
            timeout: 30000
        });
        const text = typeof res.data === 'string' ? res.data : null;
        if (!text) throw new Error('No response');
        return text;
    },

    // 4. DuckDuckGo AI Chat (gratis, no key)
    async (message) => {
        // Step 1: ambil token
        const tokenRes = await axios.get('https://duckduckgo.com/duckchat/v1/status', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'x-vqd-accept': '1'
            },
            timeout: 10000
        });
        const vqd = tokenRes.headers['x-vqd-4'];
        if (!vqd) throw new Error('No VQD token');

        // Step 2: kirim chat
        const chatRes = await axios.post('https://duckduckgo.com/duckchat/v1/chat', {
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: message }]
        }, {
            headers: {
                'Content-Type':  'application/json',
                'User-Agent':    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'x-vqd-4':       vqd,
                'Accept':        'text/event-stream'
            },
            responseType: 'text',
            timeout: 30000
        });

        // Parse SSE response
        let fullText = '';
        const lines  = chatRes.data.split('\n');
        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') continue;
            try {
                const d = JSON.parse(raw);
                if (d.message) fullText += d.message;
            } catch (_) {}
        }

        if (!fullText) throw new Error('No response');
        return fullText;
    }
];

// ─── Endpoint ─────────────────────────────────────────────────────────────────
module.exports = function(app) {
    /**
     * GET /ai/chat?q=halo&apikey=M0NPI
     *
     * Query params:
     *   q      : pertanyaan / pesan (wajib)
     *   apikey : API key (wajib)
     */
    app.get('/ai/chat', requireApiKey('ai'), async (req, res) => {
        const { q } = req.query;

        if (!q) {
            return res.status(400).json({
                status:  false,
                message: "Parameter 'q' wajib diisi!",
                contoh:  '/ai/chat?q=halo siapa kamu&apikey=M0NPI'
            });
        }

        let lastError = '';

        for (const provider of PROVIDERS) {
            try {
                const answer = await provider(q);
                return res.json({
                    status:  true,
                    message: answer
                });
            } catch (err) {
                lastError = err.message;
                // Lanjut ke provider berikutnya
            }
        }

        return res.status(500).json({
            status: false,
            error:  'Semua provider gagal: ' + lastError
        });
    });
};
