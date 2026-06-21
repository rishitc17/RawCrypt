// Shared utilities for RawCrypt frontend.

// ---------------------------------------------------------------------------
// Theme handling — default to system theme; user can override via toggle.
// ---------------------------------------------------------------------------

(function initTheme() {
    const stored = localStorage.getItem('rawcrypt-theme');
    if (stored === 'light' || stored === 'dark') {
        document.documentElement.setAttribute('data-theme', stored);
    }
})();

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = current ? current === 'dark' : prefersDark;
    const next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('rawcrypt-theme', next);
    // Update icon
    document.querySelectorAll('.theme-toggle i').forEach(el => {
        el.className = next === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    });
}

function currentThemeIsDark() {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr) return attr === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

document.addEventListener('DOMContentLoaded', () => {
    // Set initial icon based on theme.
    const isDark = currentThemeIsDark();
    document.querySelectorAll('.theme-toggle i').forEach(el => {
        el.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    });
    // Listen for system theme changes (only if no explicit override).
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        if (!localStorage.getItem('rawcrypt-theme')) {
            document.querySelectorAll('.theme-toggle i').forEach(el => {
                el.className = e.matches ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
            });
        }
    });
    // Wire up toggles.
    document.querySelectorAll('.theme-toggle').forEach(el => {
        el.addEventListener('click', toggleTheme);
    });
    // Highlight active nav link.
    const path = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-links a').forEach(a => {
        const href = a.getAttribute('href');
        if (href === path || (path === '' && href === 'index.html')) {
            a.classList.add('active');
        }
    });
});

// ---------------------------------------------------------------------------
// CSS variable reader — useful for canvas drawing.
// ---------------------------------------------------------------------------

function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ---------------------------------------------------------------------------
// Agent color palette — keep in sync with CSS variables.
// ---------------------------------------------------------------------------

const COMM_COLORS = [
    '#ff6b6b', '#4ecdc4', '#ffe66d', '#a78bfa', '#95e1d3',
    '#f38181', '#aa96da', '#fcbad3', '#7bc4a4', '#e8b04b',
];

const ATK_COLORS = [
    '#d8392b', '#b53737', '#8b2c2c', '#6b2020', '#4a1818',
];

function commColor(idx) { return COMM_COLORS[idx % COMM_COLORS.length]; }
function atkColor(idx)  { return ATK_COLORS[idx % ATK_COLORS.length]; }

// Build a stable colour lookup by agent name.
const _colorByName = {};
function colorForAgent(name, role, idx) {
    if (!_colorByName[name]) {
        _colorByName[name] = role === 'attacker' ? atkColor(idx) : commColor(idx);
    }
    return _colorByName[name];
}

function initials(name) {
    return name.split(/[\s-]+/).map(s => s[0]).join('').toUpperCase().slice(0, 2);
}

// ---------------------------------------------------------------------------
// Helper: make a websocket URL relative to the current page.
// ---------------------------------------------------------------------------

function wsUrl(path) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}${path}`;
}

// ---------------------------------------------------------------------------
// Tiny fetch wrapper.
// ---------------------------------------------------------------------------

async function apiGet(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
}

async function apiPost(path, body) {
    const r = await fetch(path, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
    });
    return r.json();
}

// ---------------------------------------------------------------------------
// Cipher pills — render a coloured pill for a cipher or attack name.
// ---------------------------------------------------------------------------

function cipherPill(name) {
    return `<span class="cipher-pill pill-${name}">${name}</span>`;
}

function attackPill(name) {
    return `<span class="attack-pill pill-${name}">${name}</span>`;
}
