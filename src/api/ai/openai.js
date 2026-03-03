const axios = require('axios');
const { requireApiKey } = require('../../lib/apiKeyAuth');

// ─── Cookie dari Netscape format ──────────────────────────────────────────────
const COOKIES = [
    'dotcom-did=845c2a47-903a-4990-b69e-95155503bbfe',
    'oai-did=4b218811-af14-4942-b2fd-4b1352d58282',
    '__cf_bm=eW_hqpuj9.uEg0lSIW4EEwtalDxpPDQzAW7lLWMeYek-1772570984.5581596-1.0.1.1-aFiC.2TxcmQyZKfeyJkGM9KkOH.czt_TU_GAVRazafTR7w6FMre0w_aN60BZlegd49zHjjc5SIp6B6__iHWXOYW.GW2rBO1e3ktT_15.uEHw3iH0xvESS6h2T5TsEgej',
    '__Host-next-auth.csrf-token=18f1c59382b522ee1c6a73e908338b5dba147a4c86c45fcec470e04db7507709%7C4e815fc6ae3db1dbcf7a31f604e92f28a0a9a94784e20569c034e52326cf9eab',
    '__Secure-next-auth.callback-url=https%3A%2F%2Fchatgpt.com%2F',
    '__Secure-next-auth.session-token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..xU3Mkk6nq0iErBX_.6kXbeF84sNFZj8aPfDOJcoOpu5z9JfGWjvvKmv1tt0wXoElIx5niBZ8ADpwTtwu5f2mwRTzVs6egG2KrxGIDhRGzBSKsATm4NfCt6vo46BlnpNll3X-ms4Je_DtmXsyaiN3FMI-8yLS4lDUMAAXIu4eK4NtHo11U9rqyLuu4thseSGmCnYiBXn_g8Zi_8FLxojS6-RQECkvPjNn3E6oV5TzGXFs5ZkPffXwxjh2ENofPEnKSbjPW0mkO9W91teZvq_37NCNMDrWuU05Cwfjor_T9VIchdCJHqdZkOPkeiWr07cUoCBnDOtYosneS1RFOOA0BD9FucBwF9eNOGcTuGw1J5PYt31gZ4xAsVZqEVfNnbm8uVHua6-7_EovJ9O-ahn7izeRAmRiTbcGzsL9xKJLjKPVX1F8DzYe48-qNkWicB7t5x6H9F-HMExAa5sfvyYrTNuu9gNZGvT7tBIP-i_2NFYc9ebaXpWj_7IsQx3JxWc33AEK_Gv4ZpSNPcpo43cjF0GVC7y8flR_k2463-1c-0ivb86YMIevA94r5N8QMenZLMAcKw562m9BYOBwF2-wHQzEDZY_p2UPy_V9_zDLTr0OL4EGoGuqk7-Sb2o7W1iVkv_aZKnAx3Ccbf10n2uwAkDtXqZU1ZD87tpusyHGh8-8TGhx9OYK9iu41KPAGihY9abtohV7YY16WCkNzb85eFeSaDL4L1tJM4u3v97ZPy6NBPUe4WHptnETlTOu-7wK7N-hZ6wlw4RdOdmdDipyOXV3kyKH8aO6h2mDuFvjfz5zAdDHYI--Swx8P5RWMde4ad2HCIDI9VmmuqrWnkYw3OTUzFdnlJgW3EuiJIszsMu1KdClCXgXJ2s_BaIRn5I5HFenZ8vYaKKwjF5lPFBEzRByhsAdt0WgUtD6weFb_CEugv96JXR6dvDr9wO0RLlI-VSoXh1unDYkSYFsR4wvM8ASOW1S6wQxx2H6ElIvhJPXimAMlmn3Mp6NS2njFGtrUEeLWBRggs9Luywjg81MA-5LCqfUwkaZ9GRoksJ17ysjGwjs26-F5tkVMzdTHI2yntYpGE8P3N9K2K9qBvtLp8XQ1TVLEJZXA7rNI9vSYuGUW-P_dh8xlbM0DerjBUSGbBUxLzw1wMBu8Rnkl4DzE-eoOJkWGbybFZqw-DFZbysXIhv-tozyH7-Yzw_Yyhe7Ly_zRjRLqAH50myK--7Yizl7sG06-UuQ0jmjPmrca0EsbNCOwWGKn4sq18AguOsmNFHmfrgPpNF0zu028_n2o1OsUEz33j6y52FzkcUBCu7xf-k_03Xpy8TndbrFCA-rXUxLP3-A80REOWPsw7JIln7yKJWYioBEITcOlFxD0J4LXsQbzsXMwITPqPxfplqg0j03oZBk9mrg0IfORJyJBPJqqVYdct4_1OmfMlfj7BkINF_Bv0iesc3uFn9Y3jSeMPrTPkk9dHSvCQ03XnW311sVSKe2IYesF06QkLeLbL8lImVgPZti3TAYcaV0HKNKNQxrLl9Ud4AadoOH5LG6K_8ilVY5WgkhJgwUQsEJY7CFvM0a52zM9V9_e4WBaCh06R9ZWtKtDWWKeBJqcZldDmphBbpCkw_DHWkeK7klpNNtr5YGZY-2IHoZoVkOe91lnByXwY2lPq6MKaT99y9zp-SdFmzZaSbPW4iZn09vFnvgki5ndgYvH7zsGa-qyt_qiyrWLC1u5qIEZUUgWZhcVQK3cpG5hOIqla2sg5awt3vt7REs5BLaYsJxg5D--wbn7z2Xk_qC6Eiy7GKOp97YOY2s7u1x96whxQZhFnqvFV5H7C2dB76OUSTXZvqnUO0r0D7x_0rc_6MQnRkF5MOqG21xm58NLHZ4npkR_m1Ta3skyJE1YPnNiHDBq5hwAfj4G6yg3B-8rAE9paAnAySNep2nKLz0EBZHH2IwCy-hX5q1MmOP1xlY1V9kAcx09RTzc7MWcCS3xbYqMQLfP9hWDyQG5WYCfJUBHvSXUip8NjA7rXapEBMJXWVA9KljocFKKLP9wZBOc4SXaRWTp8oHTHw6JZRQs7R4T1Sy0y4URLi02Sn_f5TLD5SPxJg0XMFGZ8AyzO6Vy4sEwv0R9fAFwBGHkYvaL1fpT0m1D9Bbo4qiu3pSK8EmbI2lGMagbrs0HENfTx0fkB0mkFw2P3EYkSvuYRu9UeKoi1qj6S1FsjPw4ZM3pKVe3wseSWbCj-tU6xFusPl0DTTkb0HGISNYPNWb7Z_XM-49Q2_VslPQtvJH97wrEV8EYu4RVFhFDY6OOpdBlaq_3dFzONzP6sK-DqXdM-x-DbbPbP11ouOMYW8MORrNPehsjmoHrpDsAhS7S59TW2Sj5og6g4ZzhZbmJiiamDztEcKaw3eQeU8pxF7vL6xvW9xk09u-e-K21SstvNdS_IQkoLMFTVBv_6Q_w-4u_qdSk7yqQidUrlW_kk3fwCciKwFuM0PlT7rAo09VbSRbgDZRilhKcVmtj_kQUNfRUttLMT77zUyLbmTj5-vcxSKsCuxqjqz1npHCnAIA4UE7wXnxgYmTFTXCiNBikmZlEXX5KuvCpYUpQ--qVVl7YkkqVsHSjHpd4LgAGlsgv_bTtqljRjO_bGatuWfwPqYffo0PaVMVhJ7Qhhaiv5l8lu6sGbiCI5n7ByrcTrNanUVckC2jrd9C2gOXK6Md_BBcp2T1uTJyjfqocs4q9Ls7nGLFB7swo4eY1lE3NRKBFirf1lguHzyITXlxQmwAFDXK4EKNvnSyil5i9YOT3IZmmTHlO-o1QLiyd2e9LCprG3l2BsbyFsJDDWa-2OSJksQhwO0ZNggJb5nIh7pucqj5hFmje2xppH9PK8gezoTqFO7zaWf-b7Uv6YqCUekPghG7D3-GkmEHWP0xLE57xARuuHuJfxaitbLM3CwDBoyHnkqvbDUD18mMogPzJM908vCwVyS_YmqJDztDgxG2x_JO0BHaQweLOjoj9SNbovpMydHgfkGBIYbcbNpQzUWxHniSO9HnHAPLUlqXIdGSJxNOIIBY6jvRM5a0rL3G1cqzgrv1_bDyiSvHmysxGPZe1GY7QSd22hgQP48WypI7uXvP4-_WzLr6Wj7yO8Zcjcppx3jfGcHSRshHd1PhsK5zFXBPM4dXjUd9B6BPATG4VRaG6SnvfcFg06wTwhMlqg5OvHbRUr3xmxPsatVeJIaywtAK6ahK_OlWiILlcPg4bC7lAQkBNMWALPBNaT2lCWEV2-s2RHYCuEiULUPLYJWMIs_xv226W4U06BUP3Edd86u58MNuIH3Br0YYeM5J-Ai34CSjknJ1FZZwaKTenbBNkgSFJ2SowdXZWC1iBwDHcsI0W1kHqQfLQFClDv-cP2ltKaYrPisHMXdo9x54Wlbxcx091PhaF1yWYOPXVX0MbKjayKx6BbkwWbaDCeW5p8IWLzuu5NnDqsOoX1fklgepkgLwMUIrHLo6YUHXkWl-xhEJp3Kj4SYT4Ple5FMqQR8YX9QgypFtxt6DpnbnMP90nvtESBvgZiJihUYPVhnkCtSO9o7gjlwSc_vsGTNTQRkFa7HfHP2YNvrDqJGXvgpmbXX9V8yK-rx5erytPMhphmCABzmgUdLqEkBrwqfv07Fr9dv182pKp7DF_OLWrRGgLsuvMJZC9abzYVrBrdfmW_Drdoe0.5_sARb6bq2cDP29bsqa6PQ',
    'oai-sc=0gAAAAABpp0nP9pvroaXJz7zjVW-ChXtUKl5JYDQsTRUNMsm5opdswVkfg_uVu-GCc9RXgZe5j3zNIUnUyA8cW0sTcgdC3fP_0bd0NSTr1R5b9lS-TViYrRRbyuhMugr-w6fRp1I_kwg3rbSCHQmsD902Sp4omqV-HjyrwdSpma5oEfRlv6cBZObD0vMSMZek0SMG0F1XZku0JI9to14BieFb6adlhPSC_GQX2MVt3HaiImIaKgGVIQA'
].join('; ');

const HEADERS = {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept':          'text/event-stream',
    'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
    'Content-Type':    'application/json',
    'Origin':          'https://chatgpt.com',
    'Referer':         'https://chatgpt.com/',
    'Cookie':          COOKIES
};

// ─── Ambil Access Token dari session ─────────────────────────────────────────
let cachedToken    = null;
let cachedTokenExp = 0;

async function getAccessToken() {
    if (cachedToken && Date.now() < cachedTokenExp) return cachedToken;

    const res = await axios.get('https://chatgpt.com/api/auth/session', {
        headers: { ...HEADERS, Accept: 'application/json' },
        timeout: 15000
    });

    const token = res.data?.accessToken;
    if (!token) throw new Error('Gagal ambil access token. Cookie mungkin sudah expired.');

    cachedToken    = token;
    cachedTokenExp = Date.now() + 10 * 60 * 1000; // cache 10 menit
    return token;
}

// ─── Send Chat ────────────────────────────────────────────────────────────────
async function sendChat(message, conversationId = null, parentMessageId = null) {
    const token = await getAccessToken();

    const body = {
        action: 'next',
        messages: [{
            id:     require('crypto').randomUUID(),
            author: { role: 'user' },
            content: { content_type: 'text', parts: [message] }
        }],
        model:             'auto',
        timezone_offset_min: -420,
        suggestions:       [],
        history_and_training_disabled: false,
        conversation_mode: { kind: 'primary_assistant' },
        force_paragen:     false,
        force_rate_limit:  false
    };

    if (conversationId)  body.conversation_id  = conversationId;
    if (parentMessageId) body.parent_message_id = parentMessageId;
    else body.parent_message_id = require('crypto').randomUUID();

    const res = await axios.post('https://chatgpt.com/backend-api/conversation', body, {
        headers: { ...HEADERS, Authorization: `Bearer ${token}` },
        responseType: 'stream',
        timeout: 60000
    });

    return new Promise((resolve, reject) => {
        let finalText   = '';
        let convId      = conversationId;
        let msgId       = null;
        let buffer      = '';

        res.data.on('data', chunk => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop(); // simpan baris incomplete

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const raw = line.slice(6).trim();
                if (raw === '[DONE]') continue;

                try {
                    const d = JSON.parse(raw);
                    if (d.error) { reject(new Error(d.error)); return; }

                    const msg = d.message;
                    if (!msg || msg.author?.role !== 'assistant') continue;
                    if (msg.content?.content_type !== 'text') continue;

                    const parts = msg.content?.parts;
                    if (parts && parts[0]) finalText = parts[0];

                    if (d.conversation_id) convId = d.conversation_id;
                    if (msg.id)            msgId  = msg.id;
                } catch (_) {}
            }
        });

        res.data.on('end', () => {
            if (!finalText) return reject(new Error('Tidak ada response dari ChatGPT.'));
            resolve({ text: finalText, conversation_id: convId, message_id: msgId });
        });

        res.data.on('error', reject);
    });
}

// ─── Endpoint ─────────────────────────────────────────────────────────────────
module.exports = function(app) {
    /**
     * GET /ai/chatgpt?q=hello&apikey=M0NPI
     *
     * Query params:
     *   q               : pesan / pertanyaan (wajib)
     *   conversation_id : lanjut konversasi sebelumnya (opsional)
     *   parent_id       : message id sebelumnya (opsional)
     *   apikey          : API key (wajib)
     */
    app.get('/ai/chatgpt', requireApiKey('ai'), async (req, res) => {
        const { q, conversation_id, parent_id } = req.query;

        if (!q) {
            return res.status(400).json({
                status: false,
                message: "Parameter 'q' wajib diisi!",
                contoh:  '/ai/chatgpt?q=halo siapa kamu&apikey=M0NPI'
            });
        }

        try {
            const result = await sendChat(q, conversation_id, parent_id);
            return res.json({
                status:          true,
                message:         result.text,
                conversation_id: result.conversation_id,
                message_id:      result.message_id
            });
        } catch (err) {
            return res.status(500).json({
                status: false,
                error:  err.message
            });
        }
    });
};
