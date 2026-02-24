const axios = require("axios");
const { sizeFormatter } = require('human-readable');

module.exports = function(app) {
    const formatSize = sizeFormatter({
        std: "JEDEC",
        decimalPlaces: 2,
        keepTrailingZeroes: false,
        render: (literal, symbol) => `${literal} ${symbol}B`
    });

    async function getGDriveDirectLink(url) {
        try {
            // Extract file ID dari berbagai format URL Google Drive
            let fileId = null;
            
            // Format: https://drive.google.com/file/d/FILE_ID/view
            const match1 = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
            if (match1) fileId = match1[1];
            
            // Format: https://drive.google.com/open?id=FILE_ID
            const match2 = url.match(/id=([a-zA-Z0-9_-]+)/);
            if (match2) fileId = match2[1];
            
            // Format: https://drive.google.com/uc?id=FILE_ID
            const match3 = url.match(/uc\?id=([a-zA-Z0-9_-]+)/);
            if (match3) fileId = match3[1];

            if (!fileId) {
                throw new Error("File ID tidak ditemukan");
            }

            // Dapatkan info file
            const infoUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?key=AIzaSyA_2BARxRwnwNv5kfWthR66eS1vN0fV6tY&fields=name,size,mimeType`;
            
            let fileName = "Unknown";
            let fileSize = 0;
            let mimeType = "application/octet-stream";

            try {
                const infoResponse = await axios.get(infoUrl, { timeout: 5000 });
                if (infoResponse.data) {
                    fileName = infoResponse.data.name || fileName;
                    fileSize = parseInt(infoResponse.data.size) || 0;
                    mimeType = infoResponse.data.mimeType || mimeType;
                }
            } catch (err) {
                console.log("Info fetch failed, using defaults");
            }

            // Generate download link
            const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
            
            // Cek apakah file ada
            try {
                const headResponse = await axios.head(downloadUrl, { 
                    timeout: 5000,
                    maxRedirects: 0,
                    validateStatus: (status) => status < 400
                });
                
                const contentLength = headResponse.headers['content-length'];
                if (contentLength) {
                    fileSize = parseInt(contentLength);
                }
            } catch (err) {
                // Redirect or error is expected
            }

            return {
                error: false,
                fileId: fileId,
                fileName: fileName,
                fileSize: fileSize > 0 ? formatSize(fileSize) : "Unknown",
                mimeType: mimeType,
                downloadUrl: downloadUrl,
                directUrl: `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0`,
                viewUrl: `https://drive.google.com/file/d/${fileId}/view`
            };

        } catch (error) {
            return {
                error: true,
                message: error.message
            };
        }
    }

    app.get("/downloader/drive", async (req, res) => {
        const url = req.query.url;

        if (!url) {
            return res.status(400).json({
                status: false,
                message: "Masukkan parameter ?url="
            });
        }

        // Validasi URL Google Drive
        if (!url.includes('drive.google.com')) {
            return res.status(400).json({
                status: false,
                message: "URL harus dari Google Drive"
            });
        }

        try {
            const result = await getGDriveDirectLink(url);

            if (result.error) {
                return res.status(500).json({
                    status: false,
                    message: result.message
                });
            }

            res.json({
                status: true,
                data: {
                    fileId: result.fileId,
                    fileName: result.fileName,
                    fileSize: result.fileSize,
                    mimeType: result.mimeType,
                    download: result.downloadUrl,
                    direct: result.directUrl,
                    view: result.viewUrl
                }
            });

        } catch (err) {
            res.status(500).json({
                status: false,
                error: err.message
            });
        }
    });
};