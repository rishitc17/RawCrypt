// Cipher playground logic.

let ciphers = [];
let selectedCipher = null;
let lfsrState = { bits: ['0','0','0','1'], taps: new Set([2, 1]) };

async function loadCiphers() {
    ciphers = await apiGet('/api/ciphers');
    renderCipherList();
    // Check URL hash for a specific cipher (e.g. /playground#shift).
    const hash = window.location.hash.slice(1);
    const initial = ciphers.find(c => c.name === hash) ? hash : ciphers[0].name;
    selectCipher(initial);
}

function renderCipherList() {
    const html = ciphers.map(c => `
        <div class="cipher-list-item ${selectedCipher === c.name ? 'active' : ''}" onclick="selectCipher('${c.name}')">
            <div>
                <div class="name">${cipherName(c.name)}</div>
                <div class="meters">
                    <span class="mini-meter">cost ${c.cost}</span>
                    <span class="mini-meter">security ${c.security}</span>
                </div>
            </div>
            <span class="tag ${tagClass('tag-cipher', c.name)}">${cipherName(c.name)}</span>
        </div>
    `).join('');
    document.getElementById('cipher-list').innerHTML = `
        <div class="cipher-list-header">Ciphers</div>
        ${html}
    `;
}

// FIX: defensive clearInputs — doesn't throw if elements don't exist yet.
function clearInputs() {
    const pt = document.getElementById('plaintext-input');
    if (pt) pt.value = '';
    const ct = document.getElementById('ciphertext-input');
    if (ct) ct.value = '';
    const eo = document.getElementById('encrypt-output');
    if (eo) eo.innerHTML = '';
    const dout = document.getElementById('decrypt-output');
    if (dout) dout.innerHTML = '';
    // Don't clear key-input here — the cipher-specific render will recreate it.
}

function selectCipher(name) {
    if (selectedCipher === name) return;
    selectedCipher = name;
    const c = ciphers.find(x => x.name === name);
    if (!c) return;

    // Update the list first, then clear and render.
    renderCipherList();
    clearInputs();

    // Update header.
    document.getElementById('cipher-name').textContent = cipherName(name);
    document.getElementById('cipher-badges').innerHTML = `
        <span class="tag tag-accent">cost ${c.cost}</span>
        <span class="tag ${c.security >= 7 ? 'tag-success' : c.security >= 4 ? 'tag-warning' : 'tag-danger'}">security ${c.security}</span>
    `;
    document.getElementById('cipher-description').textContent = c.description;

    // FIX: set wiki link href before rendering key input (in case render throws).
    const wikiLink = document.getElementById('cipher-wiki-link');
    if (wikiLink) {
        wikiLink.href = `/wiki#${name}`;
        wikiLink.style.display = '';
    }

    // Render the cipher-specific key input.
    const keyContainer = document.getElementById('key-container');
    try {
        if (name === 'rsa') {
            keyContainer.innerHTML = `
                <label>Key</label>
                <div class="disclaimer">
                    <i class="fa-solid fa-circle-info"></i>
                    Toy RSA uses fixed parameters: <code>p=11, q=13, n=143, e=7, d=103</code>. No key to enter — just supply the plaintext.
                </div>
            `;
        } else if (name === 'stream') {
            renderLfsrInput(keyContainer);
        } else if (name === 'permutation') {
            renderPermutationInput(keyContainer);
        } else if (name === 'substitution') {
            renderSubstitutionInput(keyContainer);
        } else {
            const kh = c.key_help;
            keyContainer.innerHTML = `
                <label>Key</label>
                <div class="field-row">
                    <input type="text" id="key-input" placeholder="${escapeHtml(kh.placeholder)}">
                    <button class="btn btn-outline btn-sm" onclick="generateKey()"><i class="fa-solid fa-dice"></i> Random</button>
                </div>
                <div class="hint">
                    <b>Format:</b> ${escapeHtml(kh.format)}<br>
                    ${escapeHtml(kh.description)}
                </div>
            `;
        }
    } catch (e) {
        // If rendering fails, fall back to a simple text input.
        keyContainer.innerHTML = `
            <label>Key</label>
            <input type="text" id="key-input" placeholder="Enter key">
        `;
    }
}

// ---------------------------------------------------------------------------
// LFSR visual input.
// ---------------------------------------------------------------------------

function renderLfsrInput(container) {
    container.innerHTML = `
        <label>LFSR Setup</label>
        <div class="lfsr-input">
            <div class="lfsr-row">
                ${[0,1,2,3].map(i => `
                    <div class="lfsr-cell">
                        <button class="lfsr-tap-btn ${lfsrState.taps.has(i) ? 'active' : ''}" onclick="toggleTap(${i})">tap</button>
                        <input type="text" class="lfsr-bit-input" maxlength="1" value="${lfsrState.bits[i]}" oninput="updateLfsrBit(${i}, this.value)" />
                        <div class="lfsr-cell-label">bit ${i}</div>
                    </div>
                `).join('')}
            </div>
            <div class="lfsr-feedback">
                <i class="fa-solid fa-arrows-rotate" style="color:var(--accent)"></i>
                Next bit = XOR of tapped bits = <b id="lfsr-feedback-val">${computeFeedback()}</b>
            </div>
        </div>
        <input type="hidden" id="key-input" />
        <div class="hint">Click <b>tap</b> above any bit to toggle whether that bit feeds back. The seed goes in the big boxes.</div>
    `;
    syncLfsrKey();
}

function toggleTap(i) {
    if (lfsrState.taps.has(i)) lfsrState.taps.delete(i);
    else lfsrState.taps.add(i);
    document.querySelectorAll('.lfsr-tap-btn').forEach((btn, idx) => {
        btn.classList.toggle('active', lfsrState.taps.has(idx));
    });
    const fb = document.getElementById('lfsr-feedback-val');
    if (fb) fb.textContent = computeFeedback();
    syncLfsrKey();
}

function updateLfsrBit(i, val) {
    val = (val || '0').substring(0, 1);
    if (val !== '0' && val !== '1') val = '0';
    lfsrState.bits[i] = val;
    const inputs = document.querySelectorAll('.lfsr-bit-input');
    if (inputs[i]) inputs[i].value = val;
    const fb = document.getElementById('lfsr-feedback-val');
    if (fb) fb.textContent = computeFeedback();
    syncLfsrKey();
}

function computeFeedback() {
    if (lfsrState.taps.size === 0) return '0';
    let result = 0;
    lfsrState.taps.forEach(t => result ^= parseInt(lfsrState.bits[t] || '0'));
    return String(result);
}

function syncLfsrKey() {
    const seed = lfsrState.bits.join('');
    const taps = Array.from(lfsrState.taps).sort((a, b) => a - b);
    const hidden = document.getElementById('key-input');
    if (hidden) hidden.value = JSON.stringify({seed, taps});
}

// ---------------------------------------------------------------------------
// Permutation visual input.
// ---------------------------------------------------------------------------

function renderPermutationInput(container) {
    const perm = [2, 0, 5, 1, 7, 3, 6, 4];
    container.innerHTML = `
        <label>Permutation Map</label>
        <div class="perm-input">
            <div class="perm-grid">
                ${perm.map((v, i) => `
                    <div class="perm-cell">
                        <div class="perm-cell-label">pos ${i}</div>
                        <input type="number" class="perm-cell-input" min="0" max="7" value="${v}" oninput="updatePermKey()" />
                    </div>
                `).join('')}
            </div>
        </div>
        <input type="hidden" id="key-input" value='${JSON.stringify(perm)}' />
        <div class="hint">Each number says where that position's byte goes. Click <b>Random</b> for a valid shuffle.</div>
        <button class="btn btn-outline btn-sm mt-2" onclick="generateKey()"><i class="fa-solid fa-dice"></i> Random permutation</button>
    `;
}

function updatePermKey() {
    const inputs = document.querySelectorAll('.perm-cell-input');
    const perm = Array.from(inputs).map(i => parseInt(i.value) || 0);
    const hidden = document.getElementById('key-input');
    if (hidden) hidden.value = JSON.stringify(perm);
}

// ---------------------------------------------------------------------------
// Substitution input.
// ---------------------------------------------------------------------------

function renderSubstitutionInput(container) {
    container.innerHTML = `
        <label>Substitution Map</label>
        <div class="disclaimer">
            <i class="fa-solid fa-circle-info"></i>
            A substitution map is a 95-entry lookup table. You can paste your own JSON here, or click <b>Random</b> to generate one.
        </div>
        <div class="field-row mt-2">
            <input type="text" id="key-input" placeholder='Paste JSON here, or click Random' />
            <button class="btn btn-outline btn-sm" onclick="generateKey()"><i class="fa-solid fa-dice"></i> Random</button>
        </div>
        <div class="hint">The map is a JSON object like <code>{"00100000": "01010000", ...}</code> mapping 8-bit binary strings to 8-bit binary strings.</div>
    `;
}

// ---------------------------------------------------------------------------
// Encrypt / decrypt.
// ---------------------------------------------------------------------------

function getKeyForRequest() {
    const hidden = document.getElementById('key-input');
    if (!hidden) return null;
    const raw = hidden.value;
    if (!raw && selectedCipher !== 'rsa') return null;
    if (selectedCipher === 'permutation') {
        try { return JSON.parse(raw); } catch { return null; }
    }
    if (selectedCipher === 'stream') {
        try { return JSON.parse(raw); } catch { return null; }
    }
    if (selectedCipher === 'substitution') {
        try { return JSON.parse(raw); } catch { return null; }
    }
    if (selectedCipher === 'shift' || selectedCipher === 'rail_fence') {
        return parseInt(raw);
    }
    if (selectedCipher === 'rsa') return null;
    return raw;
}

async function encrypt() {
    const text = document.getElementById('plaintext-input').value;
    if (!text) return;
    const key = getKeyForRequest();
    if (key === null && selectedCipher !== 'rsa') {
        showEncryptError('Please enter a valid key first.');
        return;
    }
    const r = await apiPost('/api/cipher/encrypt', {cipher: selectedCipher, text, key});
    if (r.error) { showEncryptError(r.error); return; }
    document.getElementById('encrypt-output').innerHTML = `
        <div class="output-block">${escapeHtml(r.ciphertext)}
            <button class="copy-btn" onclick="copyText('${r.ciphertext.replace(/'/g, "\\'")}')"><i class="fa-solid fa-copy"></i></button>
        </div>
    `;
}

async function decrypt() {
    const text = document.getElementById('ciphertext-input').value;
    if (!text) return;
    const key = getKeyForRequest();
    if (key === null && selectedCipher !== 'rsa') {
        showDecryptError('Please enter a valid key first.');
        return;
    }
    const r = await apiPost('/api/cipher/decrypt', {cipher: selectedCipher, text, key});
    if (r.error) { showDecryptError(r.error); return; }
    document.getElementById('decrypt-output').innerHTML = `
        <div class="output-block">${escapeHtml(r.plaintext_text)}
            <button class="copy-btn" onclick="copyText('${r.plaintext_text.replace(/'/g, "\\'")}')"><i class="fa-solid fa-copy"></i></button>
        </div>
        <div class="disclaimer mt-2">
            <i class="fa-solid fa-circle-info"></i>
            Only common punctuation (spaces, commas, full stops, exclamation marks) renders neatly. Emojis, em dashes, and other unusual symbols may show as dots.
        </div>
    `;
}

function showEncryptError(msg) {
    document.getElementById('encrypt-output').innerHTML = `<div class="disclaimer"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(msg)}</div>`;
}
function showDecryptError(msg) {
    document.getElementById('decrypt-output').innerHTML = `<div class="disclaimer"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(msg)}</div>`;
}

async function generateKey() {
    const r = await apiPost('/api/cipher/generate-key', {cipher: selectedCipher});
    if (r.error) return;
    if (selectedCipher === 'stream') {
        lfsrState.bits = r.key.seed.split('');
        lfsrState.taps = new Set(r.key.taps);
        renderLfsrInput(document.getElementById('key-container'));
    } else if (selectedCipher === 'permutation') {
        const inputs = document.querySelectorAll('.perm-cell-input');
        r.key.forEach((v, i) => { if (inputs[i]) inputs[i].value = v; });
        const hidden = document.getElementById('key-input');
        if (hidden) hidden.value = JSON.stringify(r.key);
    } else {
        const hidden = document.getElementById('key-input');
        if (hidden) hidden.value = (typeof r.key === 'object') ? JSON.stringify(r.key) : String(r.key);
    }
}

document.addEventListener('DOMContentLoaded', loadCiphers);
