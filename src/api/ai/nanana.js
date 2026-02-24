const axios = require('axios');
const crypto = require('crypto');
const FormData = require('form-data');
const { Readable } = require('stream');

class TempMailScraper {
    constructor() {
        this.baseUrl = 'https://akunlama.com';
        this.headers = {
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'referer': 'https://akunlama.com/',
            'sec-ch-ua': '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
        };
        this.recipient = crypto.randomBytes(8).toString('hex').substring(0, 10);
        this.lastCount = 0;
    }

    async getEmail() {
        return `${this.recipient}@akunlama.com`;
    }

    async waitForCode() {
        return new Promise((resolve) => {
            const interval = setInterval(async () => {
                try {
                    const inbox = await this.checkInbox();
                    if (inbox.length > this.lastCount) {
                        for (const msg of inbox.slice(this.lastCount)) {
                            const html = await this.getMessageContent(msg);
                            const code = this.extractCode(html);
                            if (code) {
                                clearInterval(interval);
                                resolve(code);
                            }
                        }
                        this.lastCount = inbox.length;
                    }
                } catch (err) {}
            }, 5000);

            // Timeout 2 menit biar gak nunggu selamanya
            setTimeout(() => {
                clearInterval(interval);
                resolve(null);
            }, 120000);
        });
    }

    async checkInbox() {
        const response = await axios.get(`${this.baseUrl}/api/list`, {
            params: { recipient: this.recipient },
            headers: { ...this.headers, referer: `https://akunlama.com/inbox/${this.recipient}/list` },
            timeout: 10000
        });
        return response.data;
    }

    async getMessageContent(msg) {
        const response = await axios.get(`${this.baseUrl}/api/getHtml`, {
            params: { region: msg.storage.region, key: msg.storage.key },
            headers: { ...this.headers, referer: `https://akunlama.com/inbox/${this.recipient}/message/${msg.storage.region}/${msg.storage.key}` },
            timeout: 10000
        });
        return response.data;
    }

    extractCode(html) {
        const match = html.match(/(\d{6})/);
        return match ? match[1] : null;
    }
}

class Nanana {
    constructor() {
        this.baseUrl = 'https://nanana.app';
        this.tempMail = new TempMailScraper();
        this.sessionToken = '';
        this.cookieString = '';
        this.defaultHeaders = {
            'accept': '*/*',
            'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'origin': this.baseUrl,
            'referer': `${this.baseUrl}/en`,
            'sec-ch-ua': '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
        };
    }

    generateFpId() {
        const random = crypto.randomBytes(32).toString('hex');
        const timestamp = Date.now().toString();
        return Buffer.from(random + timestamp).toString('base64').slice(0, 128);
    }

    async initialize() {
        const email = await this.tempMail.getEmail();
        await this.sendOtp(email);
        const code = await this.tempMail.waitForCode();

        if (!code) throw new Error('Gagal mendapatkan kode OTP dari email');

        await this.verifyOtp(email, code);
    }

    async sendOtp(email) {
        const response = await axios.post(
            `${this.baseUrl}/api/auth/email-otp/send-verification-otp`,
            { email, type: 'sign-in' },
            { headers: this.defaultHeaders, timeout: 15000 }
        );
        return response.data;
    }

    async verifyOtp(email, otp) {
        const response = await axios.post(
            `${this.baseUrl}/api/auth/sign-in/email-otp`,
            { email, otp },
            { headers: this.defaultHeaders, withCredentials: true, timeout: 15000 }
        );

        const setCookie = response.headers['set-cookie'];
        if (setCookie && setCookie.length > 0) {
            const sessionCookie = setCookie.find(c => c.includes('__Secure-better-auth.session_token'));
            if (sessionCookie) {
                this.sessionToken = sessionCookie.split(';')[0];
                this.cookieString = this.sessionToken;
            }
        }

        return response.data;
    }

    async uploadImage(imageUrl) {
        // Download dulu imagenya, lalu upload sebagai multipart/form-data
        const imgResponse = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 30000
        });

        const buffer = Buffer.from(imgResponse.data);
        const contentType = imgResponse.headers['content-type'] || 'image/jpeg';
        const ext = contentType.split('/')[1]?.split(';')[0] || 'jpg';
        const filename = `upload_${Date.now()}.${ext}`;

        const form = new FormData();
        const stream = Readable.from(buffer);
        form.append('image', stream, {
            filename,
            contentType,
            knownLength: buffer.length
        });

        const response = await axios.post(
            `${this.baseUrl}/api/upload-img`,
            form,
            {
                headers: {
                    ...this.defaultHeaders,
                    ...form.getHeaders(),
                    'Cookie': this.cookieString,
                    'x-fp-id': this.generateFpId()
                },
                timeout: 30000
            }
        );
        return response.data;
    }

    async generateImage(imageUrl, prompt) {
        const response = await axios.post(
            `${this.baseUrl}/api/image-to-image`,
            { prompt, image_urls: [imageUrl] },
            {
                headers: {
                    ...this.defaultHeaders,
                    'content-type': 'application/json',
                    'Cookie': this.cookieString,
                    'x-fp-id': this.generateFpId()
                },
                timeout: 30000
            }
        );
        return response.data;
    }

    async getResult(requestId) {
        const response = await axios.post(
            `${this.baseUrl}/api/get-result`,
            { requestId, type: 'image-to-image' },
            {
                headers: {
                    ...this.defaultHeaders,
                    'content-type': 'application/json',
                    'Cookie': this.cookieString,
                    'x-fp-id': this.generateFpId()
                },
                timeout: 15000
            }
        );
        return response.data;
    }

    async processImage(imageUrl, prompt) {
        const uploadResult = await this.uploadImage(imageUrl);
        const generateResult = await this.generateImage(uploadResult.url, prompt);

        // Polling sampai selesai, max 60 detik
        const maxAttempts = 30;
        for (let i = 0; i < maxAttempts; i++) {
            const result = await this.getResult(generateResult.request_id);
            if (result.completed) {
                return result;
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        throw new Error('Timeout: hasil generate tidak selesai dalam 60 detik');
    }
}

const { requireApiKey } = require('../../lib/apiKeyAuth');

module.exports = function(app) {
    /**
     * GET /ai/nanana
     * Query params:
     *   - url   : URL gambar yang mau diproses (wajib)
     *   - prompt: prompt untuk generate gambar (wajib)
     *
     * Contoh:
     *   /ai/nanana?url=https://example.com/image.jpg&prompt=konser
     */
    app.get('/ai/nanana', requireApiKey('ai'), async (req, res) => {
        const { url, prompt } = req.query;

        if (!url || !prompt) {
            return res.status(400).json({
                status: false,
                error: 'Parameter "url" dan "prompt" wajib diisi'
            });
        }

        try {
            const nanana = new Nanana();

            // Initialize: buat akun temp mail + login otomatis
            await nanana.initialize();

            // Proses gambar
            const result = await nanana.processImage(url, prompt);

            return res.json({
                status: true,
                result
            });
        } catch (err) {
            return res.status(500).json({
                status: false,
                error: err.message
            });
        }
    });
};
