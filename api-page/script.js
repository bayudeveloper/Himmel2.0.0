/* ═══════════════════════════════════════════════════
   Himmel API — Frontend Script
   Dark Mode | Copy Clipboard | API Counter | Stats
   ═══════════════════════════════════════════════════ */

// ── Dark / Light Mode ──────────────────────────────
let isDark = localStorage.getItem('himmel_theme') === 'dark';

function applyTheme() {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    const btn = document.getElementById('themeBtn');
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';
}

function toggleTheme() {
    isDark = !isDark;
    localStorage.setItem('himmel_theme', isDark ? 'dark' : 'light');
    applyTheme();
}

applyTheme();

// ── Toast Notification ─────────────────────────────
function showToast(msg, duration = 2200) {
    let el = document.getElementById('toastMsg');
    if (!el) {
        el = document.createElement('div');
        el.id = 'toastMsg';
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), duration);
}

// ── Copy to Clipboard ──────────────────────────────
function copyText(text, btn, label = '✅ Copied!') {
    navigator.clipboard.writeText(text).then(() => {
        if (btn) {
            const orig = btn.textContent;
            btn.textContent = label;
            btn.classList.add('copied');
            setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1800);
        }
        showToast('📋 Disalin ke clipboard!');
    }).catch(() => showToast('❌ Gagal menyalin'));
}

// ── API Call Counter ───────────────────────────────
let apiCallCount = parseInt(sessionStorage.getItem('himmel_api_calls') || '0');

function bumpCounter() {
    apiCallCount++;
    sessionStorage.setItem('himmel_api_calls', apiCallCount);
    const el = document.getElementById('counterVal');
    const wrap = document.getElementById('apiCallCounter');
    if (el) el.textContent = apiCallCount;
    if (wrap) {
        wrap.classList.add('bump');
        setTimeout(() => wrap.classList.remove('bump'), 400);
    }
}

// Init counter display
document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('counterVal');
    if (el) el.textContent = apiCallCount;
});

// ── Main DOMContentLoaded ──────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const loadingScreen = document.getElementById('loadingScreen');
    const body = document.body;
    body.classList.add('no-scroll');

    // Progress bar
    let progress = 0;
    const progressBar = document.getElementById('loadingProgressBar');
    const progressInterval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress >= 100) { progress = 100; clearInterval(progressInterval); }
        if (progressBar) progressBar.style.width = Math.min(progress, 100) + '%';
    }, 200);

    try {
        const settings = await fetch('/src/settings.json').then(r => r.json());

        const setContent = (id, prop, val) => {
            const el = document.getElementById(id);
            if (el) el[prop] = val;
        };

        // Banner image
        const randomImg = Array.isArray(settings.header.imageSrc) && settings.header.imageSrc.length
            ? settings.header.imageSrc[Math.floor(Math.random() * settings.header.imageSrc.length)]
            : '';

        const dynImg = document.getElementById('dynamicImage');
        if (dynImg) {
            dynImg.src = randomImg;
            const setSize = () => {
                const w = window.innerWidth;
                dynImg.style.maxWidth = w < 768
                    ? settings.header.imageSize.mobile || '80%'
                    : w < 1200
                        ? settings.header.imageSize.tablet || '40%'
                        : settings.header.imageSize.desktop || '40%';
                dynImg.style.height = 'auto';
            };
            setSize();
            window.addEventListener('resize', setSize);
        }

        setContent('page',          'textContent', settings.name        || 'Himmel API');
        setContent('header',        'textContent', settings.name        || 'Himmel API');
        setContent('name',          'textContent', settings.name        || 'Himmel API');
        setContent('version',       'textContent', settings.version     || 'v1.0');
        setContent('versionHeader', 'textContent', settings.header.status || 'Online!');
        setContent('description',   'textContent', settings.description || "Simple API's");

        // API Links
        const linksEl = document.getElementById('apiLinks');
        if (linksEl && settings.links?.length) {
            settings.links.forEach(({ url, name }) => {
                const a = Object.assign(document.createElement('a'), {
                    href: url, textContent: name, target: '_blank', className: 'lead'
                });
                linksEl.appendChild(a);
            });
        }

        // API Categories + Cards
        const apiContent = document.getElementById('apiContent');
        let animDelay = 0;

        settings.categories.forEach((category) => {
            const sorted = [...category.items].sort((a, b) => a.name.localeCompare(b.name));

            const cards = sorted.map((item, i) => {
                const isLast = i === sorted.length - 1;
                const fullPath = `${window.location.origin}${item.path}`;
                animDelay += 40;
                return `
                    <div class="col-md-6 col-lg-4 api-item ${isLast ? 'mb-4' : 'mb-2'}"
                         data-name="${item.name}" data-desc="${item.desc}"
                         style="animation-delay:${animDelay}ms">
                        <div class="hero-section d-flex align-items-center justify-content-between" style="height:70px;">
                            <div>
                                <h5 class="mb-0" style="font-size:18px;">${item.name}</h5>
                                <p class="text-muted mb-0" style="font-size:0.8rem;">${item.desc}</p>
                            </div>
                            <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
                                <button class="copy-path-btn" data-copy="${fullPath}" title="Copy URL">📋</button>
                                <button class="btn btn-dark btn-sm get-api-btn"
                                    data-api-path="${item.path}"
                                    data-api-name="${item.name}"
                                    data-api-desc="${item.desc}">GET</button>
                            </div>
                        </div>
                    </div>`;
            }).join('');

            apiContent.insertAdjacentHTML('beforeend',
                `<h3 class="mb-3 category-header" style="font-size:22px;animation-delay:${animDelay - 80}ms">${category.name}</h3>
                 <div class="row">${cards}</div>`
            );
        });

        // ── Copy path buttons ──
        document.addEventListener('click', e => {
            const btn = e.target.closest('.copy-path-btn');
            if (!btn) return;
            copyText(btn.dataset.copy, btn, '✅');
        });

        // ── Search ──
        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', () => {
            const q = searchInput.value.toLowerCase();
            document.querySelectorAll('.api-item').forEach(item => {
                const visible = item.dataset.name.toLowerCase().includes(q) || item.dataset.desc.toLowerCase().includes(q);
                item.style.display = visible ? '' : 'none';
            });
            document.querySelectorAll('.category-header').forEach(h => {
                const row = h.nextElementSibling;
                const hasVisible = row?.querySelectorAll('.api-item:not([style*="display: none"])').length > 0;
                h.style.display = hasVisible ? '' : 'none';
            });
        });

        // ── Modal (GET button) ──
        document.addEventListener('click', e => {
            if (!e.target.classList.contains('get-api-btn')) return;

            const { apiPath, apiName, apiDesc } = e.target.dataset;
            const modal = new bootstrap.Modal(document.getElementById('apiResponseModal'));
            const refs = {
                label:          document.getElementById('apiResponseModalLabel'),
                desc:           document.getElementById('apiResponseModalDesc'),
                content:        document.getElementById('apiResponseContent'),
                endpoint:       document.getElementById('apiEndpoint'),
                spinner:        document.getElementById('apiResponseLoading'),
                queryContainer: document.getElementById('apiQueryInputContainer'),
                submitBtn:      document.getElementById('submitQueryBtn')
            };

            refs.label.textContent = apiName;
            refs.desc.textContent  = apiDesc;
            refs.content.textContent = '';
            refs.endpoint.textContent = '';
            refs.spinner.classList.add('d-none');
            refs.content.classList.add('d-none');
            refs.endpoint.classList.add('d-none');
            refs.queryContainer.innerHTML = '';
            refs.submitBtn.classList.add('d-none');

            const baseUrl  = `${window.location.origin}${apiPath}`;
            const params   = new URLSearchParams(apiPath.split('?')[1]);
            const hasParams = params.toString().length > 0;

            if (hasParams) {
                const container = document.createElement('div');
                container.className = 'param-container';

                Array.from(params.keys()).forEach((param, idx, arr) => {
                    const wrap = document.createElement('div');
                    wrap.className = idx < arr.length - 1 ? 'mb-2' : '';
                    const input = document.createElement('input');
                    input.type = 'text'; input.className = 'form-control';
                    input.placeholder = `Enter ${param}...`;
                    input.dataset.param = param;
                    input.addEventListener('input', validateInputs);
                    wrap.appendChild(input);
                    container.appendChild(wrap);
                });

                // innerDesc support
                const currentItem = settings.categories.flatMap(c => c.items).find(i => i.path === apiPath);
                if (currentItem?.innerDesc) {
                    const d = document.createElement('div');
                    d.className = 'text-muted mt-2'; d.style.fontSize = '13px';
                    d.innerHTML = currentItem.innerDesc.replace(/\n/g, '<br>');
                    container.appendChild(d);
                }

                refs.queryContainer.appendChild(container);
                refs.submitBtn.classList.remove('d-none');

                refs.submitBtn.onclick = async () => {
                    const inputs = refs.queryContainer.querySelectorAll('input');
                    const newParams = new URLSearchParams();
                    let valid = true;
                    inputs.forEach(inp => {
                        if (!inp.value.trim()) { valid = false; inp.classList.add('is-invalid'); }
                        else { inp.classList.remove('is-invalid'); newParams.append(inp.dataset.param, inp.value.trim()); }
                    });
                    if (!valid) {
                        refs.content.textContent = 'Isi semua field yang diperlukan.';
                        refs.content.classList.remove('d-none');
                        return;
                    }
                    const fullUrl = `${window.location.origin}${apiPath.split('?')[0]}?${newParams.toString()}`;
                    refs.queryContainer.innerHTML = '';
                    refs.submitBtn.classList.add('d-none');
                    handleRequest(fullUrl, refs, apiName);
                };
            } else {
                handleRequest(baseUrl, refs, apiName);
            }

            modal.show();
        });

        function validateInputs() {
            const btn = document.getElementById('submitQueryBtn');
            const inputs = document.querySelectorAll('.param-container input');
            btn.disabled = !Array.from(inputs).every(i => i.value.trim());
        }

        async function handleRequest(url, refs, name) {
            bumpCounter();
            refs.spinner.classList.remove('d-none');
            refs.content.classList.add('d-none');

            try {
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                const ct = res.headers.get('Content-Type') || '';
                if (ct.startsWith('image/')) {
                    const blob = await res.blob();
                    const img = document.createElement('img');
                    img.src = URL.createObjectURL(blob);
                    img.alt = name; img.style.cssText = 'max-width:100%;height:auto;border-radius:8px;';
                    refs.content.innerHTML = '';
                    refs.content.appendChild(img);
                } else {
                    const data = await res.json();
                    refs.content.textContent = JSON.stringify(data, null, 2);
                }

                refs.endpoint.innerHTML = `
                    <span style="flex:1;word-break:break-all">${url}</span>
                    <button class="copy-modal-btn" onclick="copyText('${url.replace(/'/g, "\\'")}',this,'✅')">📋 Copy</button>
                `;
                refs.endpoint.style.cssText = 'display:flex;align-items:center;gap:10px;';
                refs.endpoint.classList.remove('d-none');
            } catch (err) {
                refs.content.textContent = `Error: ${err.message}`;
            } finally {
                refs.spinner.classList.add('d-none');
                refs.content.classList.remove('d-none');
            }
        }

        // Progress done
        progress = 100;
        if (progressBar) progressBar.style.width = '100%';
        clearInterval(progressInterval);

    } catch (err) {
        console.error('Error loading settings:', err);
    } finally {
        setTimeout(() => {
            loadingScreen.classList.add('fade-out');
            body.classList.remove('no-scroll');
            setTimeout(() => loadingScreen.style.display = 'none', 600);
        }, 900);
    }
});

// ── Navbar scroll ──────────────────────────────────
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    const brand  = document.querySelector('.navbar-brand');
    if (window.scrollY > 0) { brand?.classList.add('visible'); navbar?.classList.add('scrolled'); }
    else                     { brand?.classList.remove('visible'); navbar?.classList.remove('scrolled'); }
});

/* ═══════════════════════════════════════════
   Stats Cards
   ═══════════════════════════════════════════ */

async function loadUptime() {
    const el = document.getElementById('valUptime');
    if (!el) return;
    try {
        const r = await fetch('/health');
        const d = await r.json();
        el.textContent = d.uptime || 'N/A';
        el.classList.remove('loading');
    } catch { el.textContent = 'Unreachable'; }
}

function loadMonthlyUsers() {
    const el = document.getElementById('valUsers');
    if (!el) return;
    try {
        const now    = new Date();
        const key    = `himmel_visitors_${now.getFullYear()}_${now.getMonth()+1}`;
        if (!localStorage.getItem('himmel_uid')) localStorage.setItem('himmel_uid', Math.random().toString(36).slice(2));
        const todayKey = `himmel_visited_${now.toDateString()}`;
        if (!sessionStorage.getItem(todayKey)) {
            localStorage.setItem(key, parseInt(localStorage.getItem(key)||'0') + 1);
            sessionStorage.setItem(todayKey, '1');
        }
        el.textContent = parseInt(localStorage.getItem(key)||'0').toLocaleString('id-ID') + ' visits';
        el.classList.remove('loading');
    } catch { el.textContent = 'N/A'; }
}

function detectDevice() {
    const el = document.getElementById('valDevice');
    if (!el) return;
    const ua = navigator.userAgent;
    const iphone = ua.match(/iPhone OS ([\d_]+)/);
    if (iphone) { el.textContent = `iPhone (iOS ${iphone[1].replace(/_/g,'.')})`; return; }
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) { el.textContent = 'iPad'; return; }
    const android = ua.match(/\(Linux; Android [\d.]+;?\s*([^)]+)\)/);
    if (android) {
        let d = android[1].replace(/Build\/[^\s;)]+/g,'').replace(/;.*$/,'').trim();
        el.textContent = (d.length > 25 ? d.slice(0,23)+'…' : d) || 'Android Device';
        return;
    }
    if (/Windows NT/.test(ua)) { const v = ua.match(/Windows NT ([\d.]+)/); el.textContent = `Windows ${({'10.0':'10/11','6.3':'8.1','6.2':'8','6.1':'7'})[v?.[1]]||''}`.trim(); return; }
    if (/Macintosh/.test(ua)) { el.textContent = 'Mac / MacBook'; return; }
    if (/Linux/.test(ua))     { el.textContent = 'Linux PC'; return; }
    el.textContent = 'Unknown Device';
}

async function loadBattery() {
    const el = document.getElementById('valBattery');
    if (!el) return;
    if (!('getBattery' in navigator)) { el.textContent = 'Not supported'; return; }
    try {
        const bat = await navigator.getBattery();
        function render() {
            const pct = Math.round(bat.level * 100);
            const cls = pct > 50 ? 'green' : pct > 20 ? 'yellow' : 'red';
            el.innerHTML = `
                <div class="battery-bar-wrap">
                    <span class="stat-pct">${pct}%${bat.charging ? ' <span class="charging-badge">⚡ Charging</span>' : ''}</span>
                </div>
                <div class="battery-bar"><div class="battery-fill ${cls}" style="width:${pct}%"></div></div>`;
            el.classList.remove('loading');
        }
        render();
        bat.addEventListener('levelchange', render);
        bat.addEventListener('chargingchange', render);
    } catch { el.textContent = 'Unavailable'; }
}

async function loadIP() {
    const el = document.getElementById('valIP');
    if (!el) return;
    const apis = [
        () => fetch('https://api.ipify.org?format=json').then(r=>r.json()).then(d=>d.ip),
        () => fetch('https://api.my-ip.io/v2/ip.json').then(r=>r.json()).then(d=>d.ip),
        () => fetch('https://ipapi.co/json/').then(r=>r.json()).then(d=>d.ip)
    ];
    for (const fn of apis) {
        try { const ip = await fn(); if (ip) { el.textContent = ip; el.classList.remove('loading'); return; } } catch {}
    }
    el.textContent = 'Unable to detect';
}

(function initStats() {
    ['valUptime','valUsers','valDevice','valBattery','valIP'].forEach(id => {
        document.getElementById(id)?.classList.add('loading');
    });
    loadUptime(); loadMonthlyUsers(); detectDevice(); loadBattery(); loadIP();
    setInterval(loadUptime, 30000);
})();
