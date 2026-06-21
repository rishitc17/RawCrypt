// Cipher playground logic.
//
// Each cipher has its own input UI. The stream cipher gets a 4-square LFSR
// visual where users click tap buttons; permutation gets an 8-cell grid;
// substitution gets an editable random-map display; others get simple text
// inputs with cipher-specific guidance.

let ciphers = [];
let selectedCipher = null;
let lfsrState = { bits: ['0','0','0','1'], taps: new Set([2, 1]) };  // default seed + taps

async function loadCiphers() {
    ciphers = await apiGet('/api/ciphers');
    renderCipherList();
    if (ciphers.length > 0) selectCipher(ciphers[0].name);
}

function renderCipherList() {
    const html = ciphers.map(c => `
        <div class="cipher-list-item ${selectedCipher === c.name ? 'active' : ''}" onclick="selectCipher('${c.name}')">
            <div>
                <div class="name">${cipherName(c.name)}</div>
                <div class="meters">
                    <span class="mini-meter">cost ${c.cost}</span>
                    <span class="mini-meter">sec ${c.security}</span>
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

function clearInputs() {
    document.getElementById('plaintext-input').value = '';
    document.getElementById('ciphertext-input').value = '';
    document.getElementById('encrypt-output').innerHTML = '';
    document.getElementById('decrypt-output').innerHTML = '';
    document.getElementById('key-input').value = '';
}

function selectCipher(name) {
    if (selectedCipher === name) return;
    selectedCipher = name;
    const c = ciphers.find(x => x.name === name);
    if (!c) return;
    renderCipherList();
    clearInputs();

    document.getElementById('cipher-name').textContent = cipherName(name);
    document.getElementById('cipher-badges').innerHTML = `
        <span class="tag tag-accent">cost ${c.cost}</span>
        <span class="tag ${c.security >= 7 ? 'tag-success' : c.security >= 4 ? 'tag-warning' : 'tag-danger'}">security ${c.security}</span>
    `;
    document.getElementById('cipher-description').textContent = c.description;
    document.getElementById('cipher-wiki-link').href = `/wiki#${name}`;
    document.getElementById('cipher-wiki-link').style.display = '';

    // Render the cipher-specific key input.
    const keyContainer = document.getElementById('key-container');
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
                <input type="text" id="key-input" placeholder="${kh.placeholder}">
                <button class="btn btn-outline btn-sm" onclick="generateKey()"><i class="fa-solid fa-dice"></i> Random</button>
            </div>
            <div class="hint">
                <b>Format:</b> ${kh.format}<br>
                ${kh.description}
            </div>
        `;
    }
}

// ---------------------------------------------------------------------------
// LFSR visual input — 4 boxes for the seed, clickable tap buttons above.
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
    // Re-render just the tap button states.
    document.querySelectorAll('.lfsr-tap-btn').forEach((btn, idx) => {
        btn.classList.toggle('active', lfsrState.taps.has(idx));
    });
    document.getElementById('lfsr-feedback-val').textContent = computeFeedback();
    syncLfsrKey();
}

function updateLfsrBit(i, val) {
    val = (val || '0').substring(0, 1);
    if (val !== '0' && val !== '1') val = '0';
    lfsrState.bits[i] = val;
    document.querySelectorAll('.lfsr-bit-input')[i].value = val;
    document.getElementById('lfsr-feedback-val').textContent = computeFeedback();
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
// Permutation input — 8 cells, each showing where that position's byte goes.
// ---------------------------------------------------------------------------

function renderPermutationInput(container) {
    const perm = [2, 0, 5, 1, 7, 3, 6, 4];  // default
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
        <input type="hidden" id="key-input" value="${JSON.stringify(perm)}" />
        <div class="hint">Each number says where that position's byte goes. Click <b>Random</b> for a valid shuffle.</div>
        <button class="btn btn-outline btn-sm mt-2" onclick="generateKey()"><i class="fa-solid fa-dice"></i> Random permutation</button>
    `;
}

function updatePermKey() {
    const inputs = document.querySelectorAll('.perm-cell-input');
    const perm = Array.from(inputs).map(i => parseInt(i.value) || 0);
    document.getElementById('key-input').value = JSON.stringify(perm);
}

// ---------------------------------------------------------------------------
// Substitution input — show the auto-generated map summary + allow regenerate.
// ---------------------------------------------------------------------------

function renderSubstitutionInput(container) {
    container.innerHTML = `
        <label>Substitution Map</label>
        <div class="disclaimer">
            <i class="fa-solid fa-circle-info"></i>
            A substitution map is a 95-entry lookup table. You can paste your own JSON here if you have one, or click <b>Random</b> to generate one.
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
    const raw = document.getElementById('key-input').value;
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
    document.getElementById('encrypt-output').innerHTML = `<div class="disclaimer" style="background:var(--danger-soft);border-left-color:var(--danger)"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(msg)}</div>`;
}
function showDecryptError(msg) {
    document.getElementById('decrypt-output').innerHTML = `<div class="disclaimer" style="background:var(--danger-soft);border-left-color:var(--danger)"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(msg)}</div>`;
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
        document.getElementById('key-input').value = JSON.stringify(r.key);
    } else {
        document.getElementById('key-input').value = (typeof r.key === 'object') ? JSON.stringify(r.key) : String(r.key);
    }
}

document.addEventListener('DOMContentLoaded', loadCiphers);
