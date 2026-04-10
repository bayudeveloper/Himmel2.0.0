/**
 * [ Deepseek R1 — via NoteGPT ]
 *  Base    : https://notegpt.io
 *  Endpoint: GET /ai/deepseek?q=&apikey=
 */

const axios = require('axios');
const { requireApiKey } = require('../../lib/apiKeyAuth');

async function deepseekR1(message) {
    const res = await axios.post(
        'https://notegpt.io/api/v2/chat/stream',
        {
            message:         message,
            language:        'ace',
            model:           'deepseek-reasoner',
            tone:            'default',
            length:          'moderate',
            conversation_id: '641eed40-0865-4dcf-9b90-39c868e4b710',
        },
        {
            headers: { 'Content-Type': 'application/json' },
            responseType: 'stream',
            timeout: 60000,
        }
    );

    return new Promise((resolve, reject) => {
        let result = '';

        res.data.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
                if (!line.startsWith('data:')) continue;
                const payload = line.replace(/^data:\s*/, '');
                if (payload === '[DONE]') continue;
                try {
                    const parsed = JSON.parse(payload);
                    if (parsed.text) result += parsed.text;
                } catch (_) {}
            }
        });

        res.data.on('end',   () => resolve(result));
        res.data.on('error', reject);
    });
}

// ── Route ─────────────────────────────────────────────────────────────────────
module.exports = function (app) {
    app.get('/ai/deepseek', requireApiKey('ai'), async (req, res) => {
        const { q } = req.query;

        if (!q || !q.trim()) {
            return res.json({ status: false, message: 'Parameter ?q= wajib diisi' });
        }

        try {
            const result = await deepseekR1(q.trim());
            return res.json({
                status: true,
                model:  'deepseek-r1',
                result,
            });
        } catch (err) {
            return res.json({
                status:  false,
                message: err.message || 'Terjadi kesalahan',
            });
        }
    });
};
