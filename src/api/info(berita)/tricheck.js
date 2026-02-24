const axios = require('axios');

module.exports = function(app) {
    async function triCheck(msisdn) {
        const url = "https://tri.co.id/api/v1/information/sim-status";
        
        const headers = {
            "Content-Type": "application/json",
            "sec-ch-ua-platform": '"Android"',
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "sec-ch-ua": '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
            "sec-ch-ua-mobile": "?1",
            "Origin": "https://tri.co.id",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty",
            "Referer": "https://tri.co.id/",
            "Accept-Language": "id,en-US;q=0.9,en;q=0.8,ar;q=0.7"
        };

        const payload = {
            "action": "MSISDN_STATUS_WEB",
            "input1": "",
            "input2": "",
            "language": "ID",
            "msisdn": msisdn
        };

        try {
            const response = await axios.post(url, payload, { headers });
            return response.data;
        } catch (error) {
            return { 
                status: false, 
                message: error.response?.data?.message || error.message 
            };
        }
    }

    // Endpoint untuk cek nomor Tri
    app.get('/info/tricheck', async (req, res) => {
        const { nomor } = req.query;

        if (!nomor) {
            return res.status(400).json({
                status: false,
                message: "Parameter 'nomor' wajib diisi! Contoh: /info/tricheck?nomor=628973965618"
            });
        }

        try {
            const result = await triCheck(nomor);
            
            res.json({
                status: true,
                nomor: nomor,
                data: result
            });

        } catch (err) {
            res.status(500).json({
                status: false,
                error: err.message
            });
        }
    });
};