// Shared utilities for RawCrypt frontend.

const CIPHER_NAMES = {
    shift: 'Shift', rail_fence: 'Rail Fence', permutation: 'Permutation',
    vigenere: 'Vigenère', substitution: 'Substitution', stream: 'Stream',
    feistel: 'Feistel', aes: 'AES', rsa: 'RSA',
};
const ATTACK_NAMES = {
    brute_force: 'Brute Force', frequency: 'Frequency',
    known_plaintext: 'Known Plaintext', dictionary: 'Dictionary',
};
function cipherName(slug) { return CIPHER_NAMES[slug] || slug; }
function attackName(slug) { return ATTACK_NAMES[slug] || slug; }
function tagClass(prefix, slug) { return `${prefix}-${slug.replace(/_/g, '-')}`; }

// ---------------------------------------------------------------------------
// Theme handling.
// ---------------------------------------------------------------------------

(function initTheme() {
    const stored = localStorage.getItem('rawcrypt-theme');
    if (stored === 'light' || stored === 'dark') {
        document.documentElement.setAttribute('data-theme', stored);
    }
})();

function currentThemeIsDark() {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr) return attr === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyThemeVisuals() {
    const isDark = currentThemeIsDark();
    document.querySelectorAll('.switch .input').forEach(el => {
        el.checked = isDark;
    });
    // Swap the favicon based on theme.
    const favicon = document.querySelector('link[rel="icon"]');
    if (favicon) {
        favicon.href = isDark ? '/assets/favicon-dark.svg' : '/assets/favicon-light.svg';
    }
    // Swap the brand-mark glyph SVG.
    document.querySelectorAll('.brand-mark .glyph svg').forEach(svg => {
        const grad = svg.querySelector('linearGradient stop:first-child');
        const grad2 = svg.querySelector('linearGradient stop:last-child');
        if (grad && grad2) {
            if (isDark) {
                grad.setAttribute('stop-color', '#a3e635');
                grad2.setAttribute('stop-color', '#84cc16');
            } else {
                grad.setAttribute('stop-color', '#e8702a');
                grad2.setAttribute('stop-color', '#c25a1a');
            }
        }
        // Swap the keyhole colour: white in light mode, #1A1815 in dark mode.
        const circle = svg.querySelector('circle');
        const rect = svg.querySelector('rect');
        const keyColor = isDark ? '#1A1815' : '#fff';
        if (circle) {
            circle.setAttribute('stroke', keyColor);
        }
        if (rect) {
            rect.setAttribute('fill', keyColor);
        }
    });
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('rawcrypt-theme', theme);
    applyThemeVisuals();
}

function toggleTheme() {
    setTheme(currentThemeIsDark() ? 'light' : 'dark');
}

document.addEventListener('DOMContentLoaded', () => {
    applyThemeVisuals();
    // Wire up the UIVerse theme toggle — clicking the label toggles the
    // checkbox, and we sync the theme to the checkbox state.
    document.querySelectorAll('.switch').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            toggleTheme();
        });
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (!localStorage.getItem('rawcrypt-theme')) applyThemeVisuals();
    });

    // Highlight active nav link.
    const path = window.location.pathname;
    document.querySelectorAll('.nav-links a').forEach(a => {
        const href = a.getAttribute('href');
        if (href === path || (path === '/' && href === '/') ||
            (path !== '/' && href === path)) {
            a.classList.add('active');
        }
    });
});

// ---------------------------------------------------------------------------
// CSS variable reader.
// ---------------------------------------------------------------------------

function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ---------------------------------------------------------------------------
// Agent colors.
// ---------------------------------------------------------------------------

const COMM_COLORS = ['#e8702a', '#4a8c2e', '#d4a017', '#5b7c99', '#8b5a3c',
                     '#7b5ea0', '#c97b63', '#4d8c8c', '#a8703e', '#7a6e4a'];
const ATK_COLORS = ['#c9402a', '#a8362a', '#8c2e1a', '#6b2020', '#4a1818'];
function commColor(idx) { return COMM_COLORS[idx % COMM_COLORS.length]; }
function atkColor(idx) { return ATK_COLORS[idx % ATK_COLORS.length]; }

const _colorByName = {};
function colorForAgent(name, role, idx) {
    if (!_colorByName[name]) {
        _colorByName[name] = role === 'attacker' ? atkColor(idx) : commColor(idx);
    }
    return _colorByName[name];
}
function resetColorCache() { Object.keys(_colorByName).forEach(k => delete _colorByName[k]); }

function initials(name) {
    return name.split(/[\s-]+/).map(s => s[0]).join('').toUpperCase().slice(0, 2);
}

// ---------------------------------------------------------------------------
// Backend URL — configurable for split deployment.
// When deployed together (e.g. locally or on Render alone), this is empty
// and all requests are relative. When the frontend is on GitHub Pages and
// the backend is on Render, set this to the Render URL.
// ---------------------------------------------------------------------------

const BACKEND_URL = window.location.hostname === 'rishitc17.github.io'
    ? 'https://rawcrypt.onrender.com'  // ← replace with your Render URL
    : '';  // same-origin (localhost or single-host deployment)

// ---------------------------------------------------------------------------
// WebSocket URL helper.
// ---------------------------------------------------------------------------

function wsUrl(path) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = BACKEND_URL ? BACKEND_URL.replace(/^https?:/, proto) : `${proto}//${window.location.host}`;
    return `${host}${path}`;
}

// ---------------------------------------------------------------------------
// Fetch helpers.
// ---------------------------------------------------------------------------

async function apiGet(path) {
    const r = await fetch(`${BACKEND_URL}${path}`);
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
}
async function apiPost(path, body) {
    const r = await fetch(`${BACKEND_URL}${path}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
    });
    return r.json();
}

// ---------------------------------------------------------------------------
// Tags.
// ---------------------------------------------------------------------------

function cipherTag(slug) {
    return `<span class="tag ${tagClass('tag-cipher', slug)}">${cipherName(slug)}</span>`;
}
function attackTag(slug) {
    return `<span class="tag ${tagClass('tag-attack', slug)}">${attackName(slug)}</span>`;
}

// ---------------------------------------------------------------------------
// Escape HTML.
// ---------------------------------------------------------------------------

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
        ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}

function copyText(text) { navigator.clipboard.writeText(text); }
