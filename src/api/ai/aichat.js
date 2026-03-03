const axios = require('axios');
const { requireApiKey } = require('../../lib/apiKeyAuth');

const PROVIDERS = [

    // 1. DuckDuckGo AI Chat — GPT-4o-mini, gratis, no key
    async (message) => {
        const tokenRes = await axios.get('https://duckduckgo.com/duckchat/v1/status', {
            headers: {
                'User-Agent':    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'x-vqd-accept': '1'
            },
            timeout: 10000
        });
        const vqd = tokenRes.headers['x-vqd-4'];
        if (!vqd) throw new Error('No VQD token');

        const chatRes = await axios.post('https://duckduckgo.com/duckchat/v1/chat', {
            model:    'gpt-4o-mini',
            messages: [{ role: 'user', content: message }]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent':   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'x-vqd-4':      vqd,
                'Accept':       'text/event-stream'
            },
            responseType: 'text',
            timeout: 30000
        });

        let fullText = '';
        for (const line of chatRes.data.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') continue;
            try { const d = JSON.parse(raw); if (d.message) fullText += d.message; } catch (_) {}
        }
        if (!fullText) throw new Error('No response');
        return { text: fullText, model: 'GPT-4o-mini (DuckDuckGo)' };
    },

    // 2. DuckDuckGo — Claude 3 Haiku
    async (message) => {
        const tokenRes = await axios.get('https://duckduckgo.com/duckchat/v1/status', {
            headers: { 'User-Agent': 'Mozilla/5.0', 'x-vqd-accept': '1' },
            timeout: 10000
        });
        const vqd = tokenRes.headers['x-vqd-4'];
        if (!vqd) throw new Error('No VQD token');

        const chatRes = await axios.post('https://duckduckgo.com/duckchat/v1/chat', {
            model:    'claude-3-haiku-20240307',
            messages: [{ role: 'user', content: message }]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent':   'Mozilla/5.0',
                'x-vqd-4':      vqd,
                'Accept':       'text/event-stream'
            },
            responseType: 'text',
            timeout: 30000
        });

        let fullText = '';
        for (const line of chatRes.data.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') continue;
            try { const d = JSON.parse(raw); if (d.message) fullText += d.message; } catch (_) {}
        }
        if (!fullText) throw new Error('No response');
        return { text: fullText, model: 'Claude 3 Haiku (DuckDuckGo)' };
    },

    // 3. Pollinations text (simple GET, no auth)
    async (message) => {
        const res = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(message)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 30000
        });
        const text = typeof res.data === 'string' ? res.data.trim() : null;
        // Skip kalau isinya pesan deprecation
        if (!text || text.includes('IMPORTANT NOTICE') || text.includes('deprecated')) throw new Error('Deprecated response');
        return { text, model: 'Pollinations AI' };
    }
];

module.exports = function(app) {
    /**
     * GET /ai/chat?q=halo&apikey=M0NPI
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
                const result = await provider(q);
                return res.json({
                    status:  true,
                    message: result.text,
                    model:   result.model
                });
            } catch (err) {
                lastError = err.message;
            }
        }

        return res.status(500).json({
            status: false,
            error:  'Semua provider gagal: ' + lastError
        });
    });
};
