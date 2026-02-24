const https = require('https');
const http = require('http');

module.exports = function(app) {
    function apiRequest(url, options = {}) {
        return new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? https : http;

            protocol.get(url, options, (res) => {
                let data = '';

                if (res.statusCode === 301 || res.statusCode === 302) {
                    return apiRequest(res.headers.location, options)
                        .then(resolve)
                        .catch(reject);
                }

                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch {
                        resolve(data);
                    }
                });
            }).on('error', reject);
        });
    }

    async function getWeather(city) {
        const apiUrl = `https://wttr.in/${encodeURIComponent(city)}?format=j1`;
        const response = await apiRequest(apiUrl);

        if (!response.current_condition) return null;

        const current = response.current_condition[0];
        const location = response.nearest_area[0];

        return {
            location: {
                city: location.areaName[0].value,
                country: location.country[0].value,
                region: location.region[0].value
            },
            weather: {
                description: current.weatherDesc[0].value,
                icon: current.weatherIconUrl[0].value
            },
            temperature: {
                current: parseInt(current.temp_C),
                feels_like: parseInt(current.FeelsLikeC)
            },
            humidity: parseInt(current.humidity),
            wind: {
                speed: parseInt(current.windspeedKmph),
                direction: current.winddir16Point
            },
            clouds: parseInt(current.cloudcover),
            uvIndex: parseInt(current.uvIndex)
        };
    }

    app.get('/info/weather', async (req, res) => {
        try {
            const { city } = req.query;

            if (!city) {
                return res.status(400).json({
                    status: false,
                    error: "City parameter is required"
                });
            }

            const result = await getWeather(city);

            if (!result) {
                return res.status(404).json({
                    status: false,
                    error: "Weather data not found"
                });
            }

            res.status(200).json({
                status: true,
                result
            });

        } catch (error) {
            res.status(500).json({
                status: false,
                error: error.message
            });
        }
    });
};