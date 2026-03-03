const axios = require('axios');
const { requireApiKey } = require('../../lib/apiKeyAuth');

// ─── DuckDuckGo Search (ambil hasil pencarian) ────────────────────────────────
async function webSearch(query) {
    try {
        const res = await axios.get('https://api.duckduckgo.com/', {
            params: {
                q:              query,
                format:         'json',
                no_redirect:    1,
                no_html:        1,
                skip_disambig:  1
            },
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000
        });

        const d       = res.data;
        const results = [];

        // Abstract (snippet utama)
        if (d.AbstractText) results.push(d.AbstractText);

        // Related topics
        if (d.RelatedTopics?.length) {
            d.RelatedTopics.slice(0, 3).forEach(t => {
                if (t.Text) results.push(t.Text);
            });
        }

        // Answer langsung
        if (d.Answer) results.push(d.Answer);

        return results.join('\n').trim();
    } catch (_) {
        return '';
    }
}

// ─── DuckDuckGo AI Chat ───────────────────────────────────────────────────────
async function duckChat(messages, model = 'gpt-4o-mini') {
    const tokenRes = await axios.get('https://duckduckgo.com/duckchat/v1/status', {
        headers: {
            'User-Agent':    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'x-vqd-accept': '1',
            'Accept':        'application/json'
        },
        timeout: 12000
    });

    const vqd = tokenRes.headers['x-vqd-4'];
    if (!vqd) throw new Error('Gagal ambil VQD token');

    const chatRes = await axios.post('https://duckduckgo.com/duckchat/v1/chat', {
        model,
        messages
    }, {
        headers: {
            'Content-Type': 'application/json',
            'User-Agent':   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'x-vqd-4':      vqd,
            'Accept':       'text/event-stream',
            'Referer':      'https://duckduckgo.com/'
        },
        responseType: 'text',
        timeout:      40000
    });

    let fullText = '';
    for (const line of chatRes.data.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') continue;
        try {
            const d = JSON.parse(raw);
            if (d.message) fullText += d.message;
        } catch (_) {}
    }

    if (!fullText) throw new Error('Response kosong');
    return fullText;
}

// ─── Model map ────────────────────────────────────────────────────────────────
const MODEL_MAP = {
    'gpt':     'gpt-4o-mini',
    'claude':  'claude-3-haiku-20240307',
    'llama':   'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    'mixtral': 'mistralai/Mixtral-8x7B-Instruct-v0.1'
};

// ─── Endpoint ─────────────────────────────────────────────────────────────────
module.exports = function(app) {
    /**
     * GET /ai/chat?q=siapa presiden indonesia&apikey=M0NPI
     *
     * Query params:
     *   q      : pertanyaan (wajib)
     *   model  : gpt / claude / llama / mixtral (default: gpt)
     *   search : true / false — paksa web search (default: auto)
     *   apikey : API key (wajib)
     */
    app.get('/ai/chat', requireApiKey('ai'), async (req, res) => {
        const { q, model = 'gpt', search } = req.query;

        if (!q) {
            return res.status(400).json({
                status:  false,
                message: "Parameter 'q' wajib diisi!",
                contoh:  '/ai/chat?q=siapa presiden indonesia&apikey=M0NPI'
            });
        }

        const selectedModel = MODEL_MAP[model.toLowerCase()] || MODEL_MAP['gpt'];
        const now           = new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });

        // Deteksi apakah pertanyaan butuh info terkini
        const needsSearch = search === 'true' || /\b(sekarang|terkini|terbaru|saat ini|hari ini|tahun ini|presiden|perdana menteri|pm|ceo|harga|kurs|cuaca|berita|trending|terpilih|menang|kalah|juara|hasil|score|skor)\b/i.test(q);

        let searchContext = '';
        let searchUsed    = false;

        if (needsSearch) {
            searchContext = await webSearch(q);
            searchUsed    = !!searchContext;
        }

        // Susun messages dengan context
        const systemPrompt = `Kamu adalah asisten AI yang helpful. Tanggal hari ini adalah ${now}.${
            searchContext
                ? `\n\nBerikut adalah informasi terkini dari web yang relevan dengan pertanyaan user:\n---\n${searchContext}\n---\nGunakan informasi ini sebagai referensi utama untuk menjawab. Jika informasi dari web berbeda dengan pengetahuanmu, utamakan informasi dari web.`
                : '\nJawab dengan jujur. Jika kamu tidak yakin dengan informasi terkini, sampaikan bahwa data mungkin tidak update.'
        }`;

        const messages = [
            { role: 'user', content: systemPrompt + '\n\nPertanyaan: ' + q }
        ];

        try {
            const answer = await duckChat(messages, selectedModel);
            return res.json({
                status:      true,
                model:       model.toUpperCase(),
                web_search:  searchUsed,
                message:     answer
            });
        } catch (err) {
            // Fallback ke model lain
            for (const [key, mdl] of Object.entries(MODEL_MAP)) {
                if (mdl === selectedModel) continue;
                try {
                    const answer = await duckChat(messages, mdl);
                    return res.json({
                        status:     true,
                        model:      key.toUpperCase() + ' (fallback)',
                        web_search: searchUsed,
                        message:    answer
                    });
                } catch (_) {}
            }

            return res.status(500).json({
                status: false,
                error:  err.message
            });
        }
    });
};
