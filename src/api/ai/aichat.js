const axios = require('axios');
const { requireApiKey } = require('../../lib/apiKeyAuth');

const now = () => new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });

// ─── Provider 1: DuckDuckGo ───────────────────────────────────────────────────
async function duckChat(q, model = 'gpt-4o-mini') {
    const tokenRes = await axios.get('https://duckduckgo.com/duckchat/v1/status', {
        headers: { 'User-Agent': 'Mozilla/5.0', 'x-vqd-accept': '1' },
        timeout: 10000
    });
    const vqd = tokenRes.headers['x-vqd-4'];
    if (!vqd) throw new Error('No VQD');

    const chatRes = await axios.post('https://duckduckgo.com/duckchat/v1/chat', {
        model,
        messages: [{ role: 'user', content: `Hari ini ${now()}. ${q}` }]
    }, {
        headers: {
            'Content-Type': 'application/json',
            'User-Agent':   'Mozilla/5.0',
            'x-vqd-4':      vqd,
            'Accept':       'text/event-stream',
            'Referer':      'https://duckduckgo.com/'
        },
        responseType: 'text',
        timeout: 40000
    });

    let text = '';
    for (const line of chatRes.data.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') continue;
        try { const d = JSON.parse(raw); if (d.message) text += d.message; } catch (_) {}
    }
    if (!text) throw new Error('Empty response');
    return { text, model: 'GPT-4o-mini (DuckDuckGo)' };
}

// ─── Provider 2: Pollinations (baru) ─────────────────────────────────────────
async function pollinationsChat(q) {
    const res = await axios.post('https://text.pollinations.ai/', {
        messages: [
            { role: 'system', content: `Kamu asisten AI. Hari ini ${now()}. Jawab berdasarkan info terkini.` },
            { role: 'user',   content: q }
        ],
        model:  'openai',
        seed:   42,
        jsonMode: false
    }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
    });

    const text = typeof res.data === 'string' ? res.data.trim() : res.data?.choices?.[0]?.message?.content;
    if (!text || text.includes('IMPORTANT NOTICE') || text.includes('deprecated')) throw new Error('Bad response');
    return { text, model: 'Pollinations AI' };
}

// ─── Provider 3: Groq (free tier, no key needed via proxy) ───────────────────
async function groqChat(q) {
    const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model:    'llama3-8b-8192',
        messages: [
            { role: 'system', content: `Kamu asisten AI. Hari ini ${now()}.` },
            { role: 'user',   content: q }
        ]
    }, {
        headers: {
            'Content-Type':  'application/json',
            'Authorization': 'Bearer gsk_free'
        },
        timeout: 20000
    });
    const text = res.data?.choices?.[0]?.message?.content;
    if (!text) throw new Error('No response');
    return { text, model: 'Llama3 (Groq)' };
}

// ─── Provider 4: Gemini via aistudio proxy ────────────────────────────────────
async function geminiChat(q) {
    const res = await axios.post('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent', {
        contents: [{ parts: [{ text: `Hari ini ${now()}. ${q}` }] }]
    }, {
        params:  { key: 'AIzaSyC0fRJONKC09GhKBIf6aRYoUSRNdqQPVnI' },
        headers: { 'Content-Type': 'application/json' },
        timeout: 20000
    });
    const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No response');
    return { text, model: 'Gemini 1.5 Flash' };
}

// ─── Provider 5: OpenRouter free models ──────────────────────────────────────
async function openrouterChat(q) {
    const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model:    'mistralai/mistral-7b-instruct:free',
        messages: [
            { role: 'system', content: `Kamu asisten AI. Hari ini ${now()}.` },
            { role: 'user',   content: q }
        ]
    }, {
        headers: {
            'Content-Type':  'application/json',
            'Authorization': 'Bearer sk-or-free',
            'HTTP-Referer':  'https://himmel-api.vercel.app',
            'X-Title':       'Himmel API'
        },
        timeout: 20000
    });
    const text = res.data?.choices?.[0]?.message?.content;
    if (!text) throw new Error('No response');
    return { text, model: 'Mistral 7B (OpenRouter)' };
}

// ─── All providers ordered ────────────────────────────────────────────────────
const PROVIDERS = [
    (q) => duckChat(q, 'gpt-4o-mini'),
    (q) => duckChat(q, 'claude-3-haiku-20240307'),
    (q) => pollinationsChat(q),
    (q) => geminiChat(q),
    (q) => openrouterChat(q),
];

// ─── Endpoint ─────────────────────────────────────────────────────────────────
module.exports = function(app) {
    app.get('/ai/chat', requireApiKey('ai'), async (req, res) => {
        const { q } = req.query;

        if (!q) {
            return res.status(400).json({
                status:  false,
                message: "Parameter 'q' wajib diisi!",
                contoh:  '/ai/chat?q=siapa presiden indonesia&apikey=M0NPI'
            });
        }

        let lastError = '';
        for (const provider of PROVIDERS) {
            try {
                const result = await provider(q);
                return res.json({
                    status:  true,
                    model:   result.model,
                    message: result.text
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
