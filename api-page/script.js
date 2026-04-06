/* =====================================================
   Himmel API — script.js
   ===================================================== */

// ── Toast ──────────────────────────────────────────
function showToast(msg, dur) {
    dur = dur || 2000;
    var el = document.getElementById('toastMsg');
    if (!el) { el = document.createElement('div'); el.id = 'toastMsg'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function() { el.classList.remove('show'); }, dur);
}

// ── Copy ───────────────────────────────────────────
function copyText(text, btn, label) {
    label = label || 'OK';
    navigator.clipboard.writeText(text).then(function() {
        if (btn) {
            var orig = btn.textContent;
            btn.textContent = label;
            btn.classList.add('copied');
            setTimeout(function() { btn.textContent = orig; btn.classList.remove('copied'); }, 1800);
        }
        showToast('Disalin ke clipboard');
    }).catch(function() { showToast('Gagal menyalin'); });
}

// ── API Counter ────────────────────────────────────
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

// ── Uptime hitung dari 26 Februari 2026 ───────────
function getUptimeDays() {
    var start = new Date('2026-02-26T00:00:00');
    var now = new Date();
    var diffMs = now - start;
    var diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    var diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return diffDays + ' hari ' + diffHours + ' jam';
}

// ── Main ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function() {
    var loadingScreen = document.getElementById('loadingScreen');
    document.body.style.overflow = 'hidden';

    var progress = 0;
    var progressBar = document.getElementById('loadingProgressBar');
    var progressInterval = setInterval(function() {
        progress += Math.random() * 18;
        if (progress >= 100) { progress = 100; clearInterval(progressInterval); }
        if (progressBar) progressBar.style.width = Math.min(progress, 100) + '%';
    }, 180);

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

        set('page',    'textContent', settings.name || 'Himmel API');
        set('header',  'textContent', settings.name || 'Himmel API');
        set('name',    'textContent', settings.name || 'Himmel API');
        set('version', 'textContent', settings.version || 'v1.0');

        // Uptime
        var uptEl = document.getElementById('valUptime');
        if (uptEl) uptEl.textContent = getUptimeDays();

        // Links
        var linksEl = document.getElementById('apiLinks');
        if (linksEl && settings.links && settings.links.length) {
            settings.links.forEach(function(lnk) {
                var a = document.createElement('a');
                a.href = lnk.url; a.textContent = lnk.name; a.target = '_blank';
                linksEl.appendChild(a);
            });
        }

        // Description
        set('description', 'textContent', settings.description || '');

        // API Cards
        var apiContent = document.getElementById('apiContent');
        var delay = 0;
        settings.categories.forEach(function(cat) {
            var sorted = cat.items.slice().sort(function(a, b) { return a.name.localeCompare(b.name); });
            var cards = sorted.map(function(item) {
                var fullPath = window.location.origin + item.path;
                delay += 35;
                return '<div class="api-item" data-name="' + escHtml(item.name) + '" data-desc="' + escHtml(item.desc || '') + '" style="animation-delay:' + delay + 'ms">' +
                    '<div class="hero-section">' +
                    '<div><h5>' + escHtml(item.name) + '</h5><p class="text-muted">' + escHtml(item.desc || '') + '</p></div>' +
                    '<div class="hero-action-wrap">' +
                    '<button class="copy-path-btn" data-copy="' + escHtml(fullPath) + '">copy</button>' +
                    '<button class="get-api-btn" data-api-path="' + escHtml(item.path) + '" data-api-name="' + escHtml(item.name) + '" data-api-desc="' + escHtml(item.desc || '') + '">GET</button>' +
                    '</div></div></div>';
            }).join('');
            apiContent.insertAdjacentHTML('beforeend',
                '<div class="category-header" style="animation-delay:' + (delay - 60) + 'ms">' + escHtml(cat.name) + '</div>' +
                cards
            );
        });

        // Copy path
        document.addEventListener('click', function(e) {
            var btn = e.target.closest('.copy-path-btn');
            if (btn) copyText(btn.dataset.copy, btn, 'ok');
        });

        // Search
        var searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', function() {
                var q = searchInput.value.toLowerCase();
                document.querySelectorAll('.api-item').forEach(function(el) {
                    var show = (el.dataset.name.toLowerCase().includes(q) || el.dataset.desc.toLowerCase().includes(q));
                    el.style.display = show ? '' : 'none';
                });
                document.querySelectorAll('.category-header').forEach(function(h) {
                    var sib = h.nextElementSibling;
                    var hasVisible = false;
                    while (sib && sib.classList.contains('api-item')) {
                        if (sib.style.display !== 'none') hasVisible = true;
                        sib = sib.nextElementSibling;
                    }
                    h.style.display = hasVisible ? '' : 'none';
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
                    input.placeholder = param + '...';
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
                    d.className = 'text-muted mt-2'; d.style.fontSize = '12px';
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
                    img.alt = name;
                    img.style.cssText = 'max-width:100%;height:auto;border-radius:4px;';
                    refs.content.innerHTML = '';
                    refs.content.appendChild(img);
                } else {
                    var data = await res.json();
                    refs.content.textContent = JSON.stringify(data, null, 2);
                }
                refs.endpoint.innerHTML = '<span style="flex:1;word-break:break-all;font-size:.7rem">' + url + '</span>' +
                    '<button class="copy-modal-btn" onclick="copyText(\'' + url.replace(/'/g, "\\'") + '\',this,\'ok\')">copy</button>';
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
        }, 800);
    }
});

// ── Navbar scroll ──────────────────────────────────
window.addEventListener('scroll', function() {
    var brand = document.querySelector('.navbar-brand');
    if (window.scrollY > 20) brand && brand.classList.add('visible');
    else brand && brand.classList.remove('visible');
});

// ── HTML escape utility ────────────────────────────
function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
