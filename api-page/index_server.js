/**
 * ╔══════════════════════════════════════════════════════╗
 * ║             Himmel API v1.5.6                        ║
 * ║  Multi-Hosting | CF Bypass | Overlimit | Stability   ║
 * ╚══════════════════════════════════════════════════════╝
 *
 * Support hosting:
 *  - Vercel        (module.exports = app, no listen)
 *  - Railway       (app.listen, PORT env)
 *  - Render        (app.listen, PORT env)
 *  - Koyeb         (app.listen, PORT env)
 *  - VPS / Lokal   (app.listen, fallback port 3000)
 */

const express    = require('express');
const chalk      = require('chalk');
const fs         = require('fs');
const cors       = require('cors');
const path       = require('path');
const app        = express();
const fileUpload = require('express-fileupload');
const { normalLimiter, heavyLimiter, lightLimiter } = require('./src/lib/rateLimiter');

// ── Error handlers global ────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
    console.error(chalk.bgRed.white(' [UNCAUGHT EXCEPTION] '), err.message);
    // Tidak crash — hanya log (demi stabilitas)
});

process.on('unhandledRejection', (err) => {
    console.error(chalk.bgRed.white(' [UNHANDLED REJECTION] '), err?.message || err);
});

// ── Detect hosting environment ───────────────────────────────────────────────
const IS_VERCEL  = !!process.env.VERCEL;
const IS_RAILWAY = !!process.env.RAILWAY_ENVIRONMENT;
const IS_RENDER  = !!process.env.RENDER;
const IS_KOYEB   = !!process.env.KOYEB_APP_NAME;
const PORT       = parseInt(process.env.PORT) || 3000;

let hostingName = 'Local/VPS';
if (IS_VERCEL)  hostingName = 'Vercel';
if (IS_RAILWAY) hostingName = 'Railway';
if (IS_RENDER)  hostingName = 'Render';
if (IS_KOYEB)   hostingName = 'Koyeb';

// ── App config ───────────────────────────────────────────────────────────────
app.enable('trust proxy');   // Penting untuk reverse proxy semua hosting
app.set('json spaces', 2);
app.disable('x-powered-by'); // Sembunyikan Express (keamanan)

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(cors({ origin: '*' }));
app.use(fileUpload({ limits: { fileSize: 50 * 1024 * 1024 }, useTempFiles: false }));

// ── Static files ─────────────────────────────────────────────────────────────
app.use('/', express.static(path.join(__dirname, 'api-page')));
app.use('/src', express.static(path.join(__dirname, 'src')));

// ── Temp directories (kompatibel semua hosting) ──────────────────────────────
const tmpBase   = IS_VERCEL ? '/tmp' : (process.env.TMPDIR || '/tmp');
const tmpDir    = path.join(tmpBase, 'downloads');
const uploadDir = path.join(tmpBase, 'uploads');
[tmpDir, uploadDir].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ── Settings ─────────────────────────────────────────────────────────────────
let settings = { apiSettings: { creator: 'Himmel API' } };
try {
    const settingsPath = path.join(__dirname, './src/settings.json');
    if (fs.existsSync(settingsPath)) settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
} catch (err) {
    console.log(chalk.yellow('⚠️  Settings file not found, using default'));
}

// ── Stats untuk monitoring uptime ────────────────────────────────────────────
const stats = { requests: 0, errors: 0, startTime: Date.now() };

app.use((req, res, next) => {
    stats.requests++;
    res.on('finish', () => { if (res.statusCode >= 500) stats.errors++; });
    next();
});

// ── Global Rate Limiter / Overlimit Protection ────────────────────────────────
// Endpoint berat (AI, Downloader) → max 10 req/menit per IP
app.use('/ai',         heavyLimiter);
app.use('/downloader', heavyLimiter);
// Endpoint sedang
app.use('/tools',      normalLimiter);
app.use('/random',     normalLimiter);
// Endpoint ringan (search, info) → max 60 req/menit per IP
app.use('/search',     lightLimiter);
app.use('/info',       lightLimiter);

// ── Response middleware: inject creator ──────────────────────────────────────
app.use((req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = function (data) {
        if (data && typeof data === 'object' && !Array.isArray(data)) {
            return originalJson({
                status: data.status,
                creator: settings.apiSettings?.creator || 'Himmel API',
                ...data
            });
        }
        return originalJson(data);
    };
    next();
});

// ── Health & Ping (uptime monitoring, keep-alive) ────────────────────────────
app.get('/health', (req, res) => {
    const uptime = Date.now() - stats.startTime;
    const s = Math.floor(uptime / 1000);
    res.json({
        status: true,
        message: 'OK',
        hosting: hostingName,
        uptime: `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m ${s%60}s`,
        requests: stats.requests,
        errors: stats.errors,
        memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`
    });
});

app.get('/ping', (req, res) => {
    res.json({ status: true, message: 'pong', ts: Date.now() });
});

// ── Load API Routes ──────────────────────────────────────────────────────────
console.log(chalk.cyan('\n📂 Loading API Routes...\n'));

let totalRoutes = 0;
const apiFolder = path.join(__dirname, './src/api');

try {
    if (fs.existsSync(apiFolder)) {
        fs.readdirSync(apiFolder).forEach((subfolder) => {
            const subfolderPath = path.join(apiFolder, subfolder);
            if (!fs.statSync(subfolderPath).isDirectory()) return;
            fs.readdirSync(subfolderPath).forEach((file) => {
                if (path.extname(file) !== '.js') return;
                const filePath = path.join(subfolderPath, file);
                try {
                    const route = require(filePath);
                    if (typeof route === 'function') {
                        route(app);
                        totalRoutes++;
                        console.log(chalk.bgHex('#90EE90').hex('#333').bold(` ✅ ${subfolder}/${file}`));
                    } else {
                        console.log(chalk.bgYellow.hex('#333').bold(` ⚠️  ${subfolder}/${file} - not a function`));
                    }
                } catch (err) {
                    console.log(chalk.bgRed.white(` ❌ ${subfolder}/${file} - ${err.message}`));
                }
            });
        });
    }
} catch (err) {
    console.error(chalk.bgRed.white(' Error reading API folder: '), err.message);
}

console.log(chalk.bgHex('#90EE90').hex('#333').bold(`\n✅ Load Complete! Total Routes: ${totalRoutes}`));
console.log(chalk.cyan(`🌐 Hosting: ${hostingName}\n`));


// ── Monthly Visitors — unique per IP per month ──────────────────────────────
const visitorStore = { month: '', count: 0, ips: new Set() };

app.post('/api/visitors/ping', (req, res) => {
    const now   = new Date();
    const month = `${now.getFullYear()}-${now.getMonth() + 1}`;
    const ip    = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
               || req.headers['x-real-ip']
               || req.socket?.remoteAddress
               || 'unknown';
    if (visitorStore.month !== month) {
        visitorStore.month = month;
        visitorStore.count = 0;
        visitorStore.ips   = new Set();
    }
    if (!visitorStore.ips.has(ip)) {
        visitorStore.ips.add(ip);
        visitorStore.count++;
    }
    res.json({ status: true, count: visitorStore.count });
});

app.get('/api/visitors', (req, res) => {
    res.json({ status: true, count: visitorStore.count, month: visitorStore.month });
});

// ── Home page ─────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'api-page', 'index.html');
    if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
    res.json({ name: 'Himmel API', version: '1.5.6', status: 'online', routes: totalRoutes, hosting: hostingName });
});

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
    const p = path.join(__dirname, 'api-page', '404.html');
    if (fs.existsSync(p)) return res.status(404).sendFile(p);
    res.status(404).json({ status: false, error: 'Endpoint tidak ditemukan' });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error(chalk.bgRed.white(' [ERROR] '), err.message);
    stats.errors++;
    const p = path.join(__dirname, 'api-page', '500.html');
    if (fs.existsSync(p)) return res.status(500).sendFile(p);
    res.status(500).json({ status: false, error: 'Internal server error' });
});

// ── Start server (non-Vercel) ─────────────────────────────────────────────────
if (!IS_VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(chalk.bgGreen.black.bold(` 🚀 Server running on port ${PORT} [${hostingName}] `));
    });
}

// Wajib untuk Vercel; aman untuk hosting lain
module.exports = app;
