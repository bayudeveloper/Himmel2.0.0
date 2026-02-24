const axios = require('axios');

module.exports = function(app) {
    /**
     * Sidompul Scraper - Cek nomor XL/AXIS
     * Source: https://bendith.my.id
     * Original code from: https://whatsapp.com/channel/0029VbBWTAzJP211mgzALI2p
     */
    async function sidompul(number) {
        if (!number) {
            return { 
                success: false, 
                message: 'Nomor tidak boleh kosong',
                results: null 
            };
        }

        try {
            const { data } = await axios.get('https://bendith.my.id/end.php', {
                params: {
                    check: 'package',
                    number: number,
                    version: 2
                },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36'
                },
                timeout: 15000
            });

            if (!data.success) {
                return {
                    success: false,
                    message: data.message || 'Gagal mendapatkan data',
                    results: null
                };
            }

            return {
                success: true,
                results: data.data
            };

        } catch (err) {
            return { 
                success: false, 
                message: err.response?.data?.message || err.message,
                results: null 
            };
        }
    }

    /**
     * ENDPOINT: /info/cekxL?nomor=6285934417318
     * Method: GET
     * Desc: Cek kuota XL dan Axis (sama persis dengan fungsi sidompul)
     */
    app.get('/info/cekxL', async (req, res) => {
        const { nomor } = req.query;

        if (!nomor) {
            return res.status(400).json({
                status: false,
                message: "Parameter 'nomor' wajib diisi! Contoh: /info/cekxL?nomor=6285934417318"
            });
        }

        // Validasi format nomor (harus angka)
        if (!/^\d+$/.test(nomor)) {
            return res.status(400).json({
                status: false,
                message: "Nomor harus berupa angka! Contoh: 6285934417318"
            });
        }

        try {
            const result = await sidompul(nomor);
            
            if (!result.success) {
                return res.status(400).json({
                    status: false,
                    message: result.message
                });
            }

            // Return langsung sesuai format asli
            res.json({
                status: true,
                nomor: nomor,
                data: result.results
            });

        } catch (err) {
            res.status(500).json({
                status: false,
                error: err.message
            });
        }
    });
};