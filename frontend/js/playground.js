// Cipher playground logic.

let ciphers = [];
let selectedCipher = null;

async function loadCiphers() {
    ciphers = await apiGet('/api/ciphers');
    renderCipherList();
    if (ciphers.length > 0) selectCipher(ciphers[0].name);
}

function renderCipherList() {
    const html = ciphers.map(c => `
        <div class="cipher-list-item ${selectedCipher === c.name ? 'active' : ''}" onclick="selectCipher('${c.name}')">
            <div>
                <div class="name">${c.name}</div>
                <div class="meta">cost ${c.cost} • sec ${c.security}</div>
            </div>
            <span class="cipher-pill pill-${c.name}">${c.name}</span>
        </div>
    `).join('');
    document.getElementById('cipher-list').innerHTML = html;
}

function selectCipher(name) {
    selectedCipher = name;
    const c = ciphers.find(x => x.name === name);
    if (!c) return;
    renderCipherList();

    document.getElementById('cipher-name').textContent = c.name;
    document.getElementById('cipher-badges').innerHTML = `
        <span class="badge badge-accent">cost ${c.cost}</span>
        <span class="badge ${c.security >= 7 ? 'badge-success' : c.security >= 4 ? 'badge-warning' : 'badge-danger'}">security ${c.security}</span>
    `;
    document.getElementById('cipher-description').textContent = c.description;

    const kh = c.key_help;
    document.getElementById('key-format').textContent = kh.format;
    document.getElementById('key-input').placeholder = kh.placeholder;
    document.getElementById('key-help-text').textContent = kh.description;

    // RSA: hide the key input, it's fixed.
    const keyRow = document.getElementById('key-row');
    const genBtn = document.getElementById('btn-generate-key');
    if (name === 'rsa') {
        keyRow.style.display = 'none';
        genBtn.style.display = 'none';
    } else {
        keyRow.style.display = '';
        genBtn.style.display = '';
    }

    // Substitution: disable manual entry, force auto-generate.
    if (name === 'substitution') {
        document.getElementById('key-input').disabled = true;
        document.getElementById('key-input').placeholder = 'Click "Generate random key"';
    } else {
        document.getElementById('key-input').disabled = false;
    }

    clearOutputs();
}

function clearOutputs() {
    document.getElementById('encrypt-output').textContent = '';
    document.getElementById('decrypt-output').textContent = '';
}

async function encrypt() {
    const text = document.getElementById('plaintext-input').value;
    let key = document.getElementById('key-input').value;
    if (selectedCipher === 'permutation') {
        key = key.split(',').map(s => parseInt(s.trim()));
    } else if (selectedCipher === 'stream') {
        const parts = key.split(',').map(s => s.trim());
        const seed = parts[0];
        const taps = parts.slice(1).map(s => parseInt(s));
        key = [seed, taps];
    } else if (selectedCipher === 'substitution') {
        try { key = JSON.parse(key); } catch (e) {
            showEncryptError('Please click "Generate random key" first.');
            return;
        }
    }
    const r = await apiPost('/api/cipher/encrypt', {cipher: selectedCipher, text, key});
    if (r.error) { showEncryptError(r.error); return; }
    document.getElementById('encrypt-output').innerHTML = `
        <div class="code-block">${r.ciphertext}<button class="copy-btn" onclick="copyText('${r.ciphertext.replace(/'/g, "\\'")}')"><i class="fa-solid fa-copy"></i></button></div>
    `;
}

async function decrypt() {
    const text = document.getElementById('ciphertext-input').value;
    let key = document.getElementById('key-input').value;
    if (selectedCipher === 'permutation') {
        key = key.split(',').map(s => parseInt(s.trim()));
    } else if (selectedCipher === 'stream') {
        const parts = key.split(',').map(s => s.trim());
        const seed = parts[0];
        const taps = parts.slice(1).map(s => parseInt(s));
        key = [seed, taps];
    } else if (selectedCipher === 'substitution') {
        try { key = JSON.parse(key); } catch (e) {
            showDecryptError('Please click "Generate random key" first.');
            return;
        }
    }
    const r = await apiPost('/api/cipher/decrypt', {cipher: selectedCipher, text, key});
    if (r.error) { showDecryptError(r.error); return; }
    document.getElementById('decrypt-output').innerHTML = `
        <div class="code-block">${r.plaintext_text}<button class="copy-btn" onclick="copyText('${r.plaintext_text.replace(/'/g, "\\'")}')"><i class="fa-solid fa-copy"></i></button></div>
        <div class="text-muted" style="font-size:0.78rem;margin-top:6px">raw hex: ${r.plaintext_hex}</div>
    `;
}

function showEncryptError(msg) {
    document.getElementById('encrypt-output').innerHTML = `<div class="badge badge-danger"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(msg)}</div>`;
}

function showDecryptError(msg) {
    document.getElementById('decrypt-output').innerHTML = `<div class="badge badge-danger"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(msg)}</div>`;
}

async function generateKey() {
    const r = await apiPost('/api/cipher/generate-key', {cipher: selectedCipher});
    if (r.error) return;
    let keyStr;
    if (selectedCipher === 'permutation') keyStr = r.key.join(',');
    else if (selectedCipher === 'stream') keyStr = `${r.key.seed},${r.key.taps.join(',')}`;
    else if (selectedCipher === 'substitution') keyStr = JSON.stringify(r.key);
    else keyStr = String(r.key);
    document.getElementById('key-input').value = keyStr;
}

function copyText(text) {
    navigator.clipboard.writeText(text);
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}

document.addEventListener('DOMContentLoaded', loadCiphers);
