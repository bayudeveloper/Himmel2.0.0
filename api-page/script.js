/* =====================================================
   Himmel API — script.js
   ===================================================== */

// ── Toast ────────────────────────────────────────────
function showToast(msg, dur = 2200) {
    let el = document.getElementById('toastMsg');
    if (!el) { el = document.createElement('div'); el.id = 'toastMsg'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), dur);
}

// ── Copy ─────────────────────────────────────────────
function copyText(text, btn, label) {
    label = label || 'Copied!';
    navigator.clipboard.writeText(text).then(() => {
        if (btn) {
            var orig = btn.textContent;
            btn.textContent = label;
            btn.classList.add('copied');
            setTimeout(function() { btn.textContent = orig; btn.classList.remove('copied'); }, 1800);
        }
        showToast('Disalin ke clipboard!');
    }).catch(function() { showToast('Gagal menyalin'); });
}

// ── API Counter ───────────────────────────────────────
var apiCallCount = parseInt(sessionStorage.getItem('himmel_api_calls') || '0');
function bumpCounter() {
    apiCallCount++;
    sessionStorage.setItem('himmel_api_calls', apiCallCount);
    var el = document.getElementById('counterVal');
    var wrap = document.getElementById('apiCallCounter');
    if (el) el.textContent = apiCallCount;
    if (wrap) { wrap.classList.add('bump'); setTimeout(function() { wrap.classList.remove('bump'); }, 400); }
}
document.addEventListener('DOMContentLoaded', function() {
    var el = document.getElementById('counterVal');
    if (el) el.textContent = apiCallCount;
});

// ── Main ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function() {
    var loadingScreen = document.getElementById('loadingScreen');
    document.body.style.overflow = 'hidden';

    var progress = 0;
    var progressBar = document.getElementById('loadingProgressBar');
    var progressInterval = setInterval(function() {
        progress += Math.random() * 15;
        if (progress >= 100) { progress = 100; clearInterval(progressInterval); }
        if (progressBar) progressBar.style.width = Math.min(progress, 100) + '%';
    }, 200);

    try {
        var settings = await fetch('/src/settings.json').then(function(r) { return r.json(); });

        function set(id, prop, val) { var e = document.getElementById(id); if (e) e[prop] = val; }

        // Banner
        var imgs = settings.header && Array.isArray(settings.header.imageSrc) ? settings.header.imageSrc : [];
        var randomImg = imgs.length ? imgs[Math.floor(Math.random() * imgs.length)] : '';
        var dynImg = document.getElementById('dynamicImage');
        if (dynImg && randomImg) {
            dynImg.src = randomImg;
            function setSize() {
                var w = window.innerWidth;
                var sz = settings.header.imageSize || {};
                dynImg.style.maxWidth = w < 768 ? (sz.mobile || '100%') : w < 1200 ? (sz.tablet || '100%') : (sz.desktop || '100%');
                dynImg.style.height = 'auto';
            }
            setSize();
            window.addEventListener('resize', setSize);
        }

        set('page',          'textContent', settings.name || 'Himmel API');
        set('header',        'textContent', settings.name || 'Himmel API');
        set('name',          'textContent', settings.name || 'Himmel API');
        set('version',       'textContent', settings.version || 'v1.0');
        set('versionHeader', 'textContent', (settings.header && settings.header.status) || 'Online!');
        set('description',   'textContent', settings.description || '');

        // Links
        var linksEl = document.getElementById('apiLinks');
        if (linksEl && settings.links && settings.links.length) {
            settings.links.forEach(function(lnk) {
                var a = document.createElement('a');
                a.href = lnk.url; a.textContent = lnk.name; a.target = '_blank';
                linksEl.appendChild(a);
            });
        }

        // API Cards
        var apiContent = document.getElementById('apiContent');
        var delay = 0;
        settings.categories.forEach(function(cat) {
            var sorted = cat.items.slice().sort(function(a, b) { return a.name.localeCompare(b.name); });
            var cards = sorted.map(function(item) {
                var fullPath = window.location.origin + item.path;
                delay += 40;
                return '<div class="col-md-6 col-lg-4 api-item" data-name="' + item.name + '" data-desc="' + (item.desc || '') + '" style="animation-delay:' + delay + 'ms">' +
                    '<div class="hero-section">' +
                    '<div><h5>' + item.name + '</h5><p class="text-muted">' + (item.desc || '') + '</p></div>' +
                    '<div class="hero-action-wrap">' +
                    '<button class="copy-path-btn" data-copy="' + fullPath + '">📋</button>' +
                    '<button class="btn btn-dark btn-sm get-api-btn" data-api-path="' + item.path + '" data-api-name="' + item.name + '" data-api-desc="' + (item.desc || '') + '">GET</button>' +
                    '</div></div></div>';
            }).join('');
            apiContent.insertAdjacentHTML('beforeend',
                '<h3 class="category-header mb-3" style="animation-delay:' + (delay - 80) + 'ms">' + cat.name + '</h3>' +
                '<div class="row">' + cards + '</div>'
            );
        });

        // Copy path
        document.addEventListener('click', function(e) {
            var btn = e.target.closest('.copy-path-btn');
            if (btn) copyText(btn.dataset.copy, btn, '✅');
        });

        // Search
        var searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', function() {
                var q = searchInput.value.toLowerCase();
                document.querySelectorAll('.api-item').forEach(function(el) {
                    el.style.display = (el.dataset.name.toLowerCase().includes(q) || el.dataset.desc.toLowerCase().includes(q)) ? '' : 'none';
                });
                document.querySelectorAll('.category-header').forEach(function(h) {
                    var row = h.nextElementSibling;
                    h.style.display = row && row.querySelectorAll('.api-item:not([style*="display: none"])').length ? '' : 'none';
                });
            });
        }

        // Modal
        document.addEventListener('click', function(e) {
            if (!e.target.classList.contains('get-api-btn')) return;
            var apiPath = e.target.dataset.apiPath;
            var apiName = e.target.dataset.apiName;
            var apiDesc = e.target.dataset.apiDesc;
            var modal = new bootstrap.Modal(document.getElementById('apiResponseModal'));
            var refs = {
                label: document.getElementById('apiResponseModalLabel'),
                desc: document.getElementById('apiResponseModalDesc'),
                content: document.getElementById('apiResponseContent'),
                endpoint: document.getElementById('apiEndpoint'),
                spinner: document.getElementById('apiResponseLoading'),
                queryContainer: document.getElementById('apiQueryInputContainer'),
                submitBtn: document.getElementById('submitQueryBtn')
            };
            refs.label.textContent = apiName;
            refs.desc.textContent = apiDesc;
            refs.content.textContent = '';
            refs.endpoint.textContent = '';
            refs.content.classList.add('d-none');
            refs.endpoint.classList.add('d-none');
            refs.spinner.classList.add('d-none');
            refs.queryContainer.innerHTML = '';
            refs.submitBtn.classList.add('d-none');

            var baseUrl = window.location.origin + apiPath;
            var params = new URLSearchParams(apiPath.split('?')[1]);
            var hasParams = params.toString().length > 0;

            if (hasParams) {
                var container = document.createElement('div');
                container.className = 'param-container';
                Array.from(params.keys()).forEach(function(param, idx, arr) {
                    var wrap = document.createElement('div');
                    wrap.className = idx < arr.length - 1 ? 'mb-2' : '';
                    var input = document.createElement('input');
                    input.type = 'text'; input.className = 'form-control';
                    input.placeholder = 'Enter ' + param + '...';
                    input.dataset.param = param;
                    input.addEventListener('input', function() {
                        refs.submitBtn.disabled = !Array.from(container.querySelectorAll('input')).every(function(i) { return i.value.trim(); });
                    });
                    wrap.appendChild(input);
                    container.appendChild(wrap);
                });
                var currentItem = settings.categories.flatMap(function(c) { return c.items; }).find(function(i) { return i.path === apiPath; });
                if (currentItem && currentItem.innerDesc) {
                    var d = document.createElement('div');
                    d.className = 'text-muted mt-2'; d.style.fontSize = '13px';
                    d.innerHTML = currentItem.innerDesc.replace(/\n/g, '<br>');
                    container.appendChild(d);
                }
                refs.queryContainer.appendChild(container);
                refs.submitBtn.classList.remove('d-none');
                refs.submitBtn.disabled = true;
                refs.submitBtn.onclick = function() {
                    var inputs = container.querySelectorAll('input');
                    var newParams = new URLSearchParams();
                    var valid = true;
                    inputs.forEach(function(inp) {
                        if (!inp.value.trim()) { valid = false; inp.classList.add('is-invalid'); }
                        else { inp.classList.remove('is-invalid'); newParams.append(inp.dataset.param, inp.value.trim()); }
                    });
                    if (!valid) return;
                    var fullUrl = window.location.origin + apiPath.split('?')[0] + '?' + newParams.toString();
                    refs.queryContainer.innerHTML = '';
                    refs.submitBtn.classList.add('d-none');
                    handleRequest(fullUrl, refs, apiName);
                };
            } else {
                handleRequest(baseUrl, refs, apiName);
            }
            modal.show();
        });

        async function handleRequest(url, refs, name) {
            bumpCounter();
            refs.spinner.classList.remove('d-none');
            refs.content.classList.add('d-none');
            refs.endpoint.classList.add('d-none');
            try {
                var res = await fetch(url);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                var ct = res.headers.get('Content-Type') || '';
                if (ct.startsWith('image/')) {
                    var blob = await res.blob();
                    var img = document.createElement('img');
                    img.src = URL.createObjectURL(blob);
                    img.alt = name; img.style.cssText = 'max-width:100%;height:auto;border-radius:8px;';
                    refs.content.innerHTML = '';
                    refs.content.appendChild(img);
                } else {
                    var data = await res.json();
                    refs.content.textContent = JSON.stringify(data, null, 2);
                }
                refs.endpoint.innerHTML = '<span style="flex:1;word-break:break-all">' + url + '</span>' +
                    '<button class="copy-modal-btn" onclick="copyText(\'' + url.replace(/'/g, "\\'") + '\',this,\'✅\')">📋 Copy</button>';
                refs.endpoint.style.cssText = 'display:flex;align-items:center;gap:10px;';
                refs.endpoint.classList.remove('d-none');
            } catch (err) {
                refs.content.textContent = 'Error: ' + err.message;
            } finally {
                refs.spinner.classList.add('d-none');
                refs.content.classList.remove('d-none');
            }
        }

        progress = 100;
        if (progressBar) progressBar.style.width = '100%';
        clearInterval(progressInterval);

    } catch (err) {
        console.error('Settings error:', err);
    } finally {
        setTimeout(function() {
            if (loadingScreen) loadingScreen.classList.add('fade-out');
            document.body.style.overflow = '';
            setTimeout(function() { if (loadingScreen) loadingScreen.style.display = 'none'; }, 600);
        }, 900);
    }
});

// ── Navbar scroll ─────────────────────────────────────
window.addEventListener('scroll', function() {
    var brand = document.querySelector('.navbar-brand');
    if (window.scrollY > 0) brand && brand.classList.add('visible');
    else brand && brand.classList.remove('visible');
});

/* =====================================================
   STATS
   ===================================================== */

// Uptime — from /health endpoint (server's actual uptime)
var _sec = 0, _tickOn = false;
function fmtTime(s) {
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm ' + String(ss).padStart(2, '0') + 's';
    if (m > 0) return m + 'm ' + String(ss).padStart(2, '0') + 's';
    return ss + 's';
}
function startTicker() {
    if (_tickOn) return; _tickOn = true;
    setInterval(function() {
        _sec++;
        var el = document.getElementById('valUptime');
        if (el) el.textContent = fmtTime(_sec);
    }, 1000);
}
async function loadUptime() {
    try {
        var d = await fetch('/health').then(function(r) { return r.json(); });
        if (d.uptime) {
            var m = d.uptime.match(/(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s)?/);
            _sec = (parseInt(m && m[1] || 0) * 3600) + (parseInt(m && m[2] || 0) * 60) + parseInt(m && m[3] || 0);
        }
        var ramEl = document.getElementById('valRam');
        if (ramEl && d.memory) ramEl.textContent = d.memory;
        var uptEl = document.getElementById('valUptime');
        if (uptEl) uptEl.textContent = fmtTime(_sec);
        startTicker();
    } catch(e) {
        var el = document.getElementById('valUptime');
        if (el) el.textContent = 'Unreachable';
    }
}

// Monthly visitors — server-side, unique per IP per month
async function loadMonthlyUsers() {
    var el = document.getElementById('valUsers');
    if (!el) return;
    try {
        await fetch('/api/visitors/ping', { method: 'POST' });
        var d = await fetch('/api/visitors').then(function(r) { return r.json(); });
        el.textContent = (d.count || 0).toLocaleString('id-ID') + ' visits';
    } catch(e) {
        el.textContent = 'N/A';
    }
}

// Device — always visitor's browser/device
function detectDevice() {
    var el = document.getElementById('valDevice');
    if (!el) return;
    var ua = navigator.userAgent;
    var iphone = ua.match(/iPhone OS ([\d_]+)/);
    if (iphone) { el.textContent = 'iPhone (iOS ' + iphone[1].replace(/_/g, '.') + ')'; return; }
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) { el.textContent = 'iPad'; return; }
    var android = ua.match(/\(Linux; Android [\d.]+;?\s*([^)]+)\)/);
    if (android) {
        var d = android[1].replace(/Build\/[^\s;)]+/g, '').replace(/;.*$/, '').trim();
        el.textContent = (d.length > 25 ? d.slice(0, 23) + '…' : d) || 'Android Device';
        return;
    }
    if (/Windows NT/.test(ua)) { var v = ua.match(/Windows NT ([\d.]+)/); var vmap = {'10.0':'10/11','6.3':'8.1','6.2':'8','6.1':'7'}; el.textContent = 'Windows ' + (vmap[v && v[1]] || ''); return; }
    if (/Macintosh/.test(ua)) { el.textContent = 'Mac / MacBook'; return; }
    if (/Linux/.test(ua))     { el.textContent = 'Linux PC'; return; }
    el.textContent = 'Unknown Device';
}

// Battery
async function loadBattery() {
    var el = document.getElementById('valBattery');
    if (!el) return;
    if (!('getBattery' in navigator)) { el.textContent = 'Not supported'; return; }
    try {
        var bat = await navigator.getBattery();
        function render() {
            var pct = Math.round(bat.level * 100);
            var cls = pct > 50 ? 'green' : pct > 20 ? 'yellow' : 'red';
            el.innerHTML = '<div class="battery-bar-wrap"><span class="stat-pct">' + pct + '%' +
                (bat.charging ? ' <span class="charging-badge">⚡</span>' : '') + '</span></div>' +
                '<div class="battery-bar"><div class="battery-fill ' + cls + '" style="width:' + pct + '%"></div></div>';
        }
        render();
        bat.addEventListener('levelchange', render);
        bat.addEventListener('chargingchange', render);
    } catch(e) { el.textContent = 'Unavailable'; }
}

// IP — always visitor's IP from external API
async function loadIP() {
    var el = document.getElementById('valIP');
    if (!el) return;
    var apis = [
        function() { return fetch('https://api.ipify.org?format=json').then(function(r){return r.json();}).then(function(d){return d.ip;}); },
        function() { return fetch('https://api.my-ip.io/v2/ip.json').then(function(r){return r.json();}).then(function(d){return d.ip;}); },
        function() { return fetch('https://ipapi.co/json/').then(function(r){return r.json();}).then(function(d){return d.ip;}); }
    ];
    for (var i = 0; i < apis.length; i++) {
        try { var ip = await apis[i](); if (ip) { el.textContent = ip; return; } } catch(e) {}
    }
    el.textContent = 'Unable to detect';
}

(function initStats() {
    loadUptime(); loadMonthlyUsers(); detectDevice(); loadBattery(); loadIP();
    setInterval(loadUptime, 30000);
})();
