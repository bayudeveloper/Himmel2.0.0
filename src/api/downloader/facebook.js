const { cfGet, cfPost, getCFBypassHeaders } = require('../../lib/cfBypass');
const cheerio = require('cheerio');

module.exports = function(app) {

    async function snapsave(url) {
        // Step 1: Ambil token dari halaman utama (dengan CF bypass)
        const pageRes = await cfGet('https://snapsave.app/id', {
            referer: null,
            extra: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
            timeout: 20000
        });

        const $page = cheerio.load(pageRes.data);
        const token = $page('input[name="token"]').val() ||
                      $page('input[name="_token"]').val() ||
                      $page('meta[name="csrf-token"]').attr('content') || '';
        const cookies = pageRes.headers['set-cookie'];
        const cookieString = cookies ? cookies.map(c => c.split(';')[0]).join('; ') : '';

        // Step 2: POST URL (dengan CF bypass headers)
        const formData = new URLSearchParams();
        formData.append('url', url);
        if (token) formData.append('token', token);

        const postRes = await cfPost('https://snapsave.app/action.php', formData.toString(), {
            origin: 'https://snapsave.app',
            referer: 'https://snapsave.app/id',
            extra: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': cookieString
            },
            timeout: 25000
        });

        const data = postRes.data;
        const $ = cheerio.load(typeof data === 'string' ? data : JSON.stringify(data));
        const results = [];

        $('tbody tr').each((i, el) => {
            const tds = $(el).find('td');
            const quality = $(tds[0]).text().trim();
            const type = $(tds[1]).text().trim();
            const a = $(tds[2]).find('a') || $(el).find('a');
            const dlUrl = a.attr('href');
            if (dlUrl && dlUrl.startsWith('http')) {
                results.push({ quality: quality || `Video ${i + 1}`, type: type || 'video', url: dlUrl });
            }
        });

        if (results.length === 0) {
            $('a').each((i, el) => {
                const href = $(el).attr('href');
                const text = $(el).text().trim();
                if (href && href.startsWith('http') &&
                    (href.includes('fbcdn') || href.includes('facebook') || href.includes('snapsave'))) {
                    results.push({ quality: text || `Link ${i + 1}`, type: 'video', url: href });
                }
            });
        }

        return results;
    }

    app.get('/downloader/snapsave', async (req, res) => {
        const { url } = req.query;
        if (!url) return res.status(400).json({ status: false, message: "Parameter 'url' wajib diisi!" });
        if (!url.includes('facebook.com') && !url.includes('fb.watch')) {
            return res.status(400).json({ status: false, message: 'URL harus dari Facebook (facebook.com atau fb.watch)' });
        }
        try {
            const results = await snapsave(url);
            if (!results || results.length === 0) {
                return res.status(404).json({ status: false, message: 'Tidak ada video ditemukan. Pastikan URL valid dan video bersifat publik.' });
            }
            res.json({ status: true, url, total: results.length, data: results });
        } catch (err) {
            res.status(500).json({ status: false, error: err.message });
        }
    });
};
