// Shared utilities for RawCrypt frontend.

// ---------------------------------------------------------------------------
// Friendly name maps — convert snake_case slugs to human-readable names.
// ---------------------------------------------------------------------------

const CIPHER_NAMES = {
    shift:        'Shift',
    rail_fence:   'Rail Fence',
    permutation:  'Permutation',
    vigenere:     'Vigenère',
    substitution: 'Substitution',
    stream:       'Stream',
    feistel:      'Feistel',
    aes:          'AES',
    rsa:          'RSA',
};

const ATTACK_NAMES = {
    brute_force:      'Brute Force',
    frequency:        'Frequency',
    known_plaintext:  'Known Plaintext',
    dictionary:       'Dictionary',
};

function cipherName(slug) { return CIPHER_NAMES[slug] || slug; }
function attackName(slug) { return ATTACK_NAMES[slug] || slug; }

// CSS class slugs — replace underscores with hyphens for tag classes.
function tagClass(prefix, slug) {
    return `${prefix}-${slug.replace(/_/g, '-')}`;
}

// ---------------------------------------------------------------------------
// Theme handling — slider control, defaults to system.
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
    document.querySelectorAll('.theme-slider').forEach(el => {
        el.setAttribute('data-theme', isDark ? 'dark' : 'light');
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
    // Wire up theme sliders.
    document.querySelectorAll('.theme-slider').forEach(el => {
        el.addEventListener('click', toggleTheme);
    });
    // Listen for system theme changes (only if no explicit override).
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (!localStorage.getItem('rawcrypt-theme')) applyThemeVisuals();
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
// Agent color palette.
// ---------------------------------------------------------------------------

const COMM_COLORS = [
    '#c44536', '#4a7c2e', '#d4a017', '#5b7c99',
    '#8b5a3c', '#6b4e8d', '#c97b63', '#4d8c8c',
    '#a8703e', '#7a6e4a',
];
const ATK_COLORS = ['#7a1f1f', '#5d1a1a', '#8c2e1a', '#6b2020', '#4a1818'];

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

function resetColorCache() {
    Object.keys(_colorByName).forEach(k => delete _colorByName[k]);
}

function initials(name) {
    return name.split(/[\s-]+/).map(s => s[0]).join('').toUpperCase().slice(0, 2);
}

// ---------------------------------------------------------------------------
// WebSocket URL helper.
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
// Friendly cipher / attack tags.
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

// Copy text helper.
function copyText(text) {
    navigator.clipboard.writeText(text);
}
