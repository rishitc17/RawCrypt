// Cipher playground logic.

let ciphers = [];
let selectedCipher = null;
let lfsrState = { bits: ['0','0','0','1'], taps: new Set([2, 1]) };

// Expanded cipher descriptions for the playground — exactly 3 sentences each.
const CIPHER_DESCRIPTIONS = {
    shift: "The Caesar shift cipher nudges every byte of your message forward by the same amount. It's the oldest trick in the book, dating back to Julius Caesar. With only 256 possible keys, brute force cracks it in milliseconds.",
    rail_fence: "Rail Fence writes your message in a zig-zag across N horizontal rails, then reads each rail left to right. It's a transposition cipher, so no letters get replaced — just rearranged. With only 18 possible rail counts, brute force still cracks it instantly.",
    permutation: "Permutation chops your message into 8-byte blocks and rearranges the bytes of each block. The pattern is the key, and there are 8! = 40,320 possible patterns. A modern computer can try them all in under a second.",
    vigenere: "Vigenère repeats a short key to match your message length, then shifts each character by the corresponding key character. The same plaintext letter doesn't always become the same ciphertext letter, which defeats simple frequency counts. A known-plaintext attack reveals the key cycle directly.",
    substitution: "Substitution builds a lookup table mapping every printable byte to a different one. There are 95! possible keys, so brute force is impossible. But frequency analysis cracks it, because the most common ciphertext byte is probably the substitute for space.",
    stream: "Stream generates a long pseudo-random keystream from a short seed, then XORs it with your message. Decryption is the same operation, because XOR is its own inverse. The keystream comes from a Linear Feedback Shift Register, which is fast but insecure on its own.",
    feistel: "Feistel splits the block into two halves L and R, then on each round swaps them and XORs one half with a function of the other. The elegant trick is that decryption uses the exact same circuit with round keys in reverse. DES, the famous cipher from 1977, is a 16-round Feistel network.",
    aes: "AES is the most widely used symmetric cipher in the world, protecting HTTPS, WiFi, and disk encryption. Each round applies four steps: SubBytes, ShiftRows, MixColumns, and AddRoundKey. Real AES uses 128-bit blocks and 10-14 rounds; this toy version uses 16-bit blocks and 2 rounds.",
    rsa: "RSA's security rests on the fact that multiplying two large primes is easy, but factoring the product back is hard. You pick two primes p and q, compute n = p×q, and pick a public exponent e. Anyone can encrypt with c = mᵉ mod n, but only you can decrypt with m = cᵈ mod n using your private key d.",
};

async function loadCiphers() {
    ciphers = await apiGet('/api/ciphers');
    renderCipherList();
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
                    <span class="mini-meter">Cost: ${c.cost}</span>
                    <span class="mini-meter">Security: ${c.security}</span>
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
    const pt = document.getElementById('plaintext-input');
    if (pt) pt.value = '';
    const ct = document.getElementById('ciphertext-input');
    if (ct) ct.value = '';
    const eo = document.getElementById('encrypt-output');
    if (eo) eo.innerHTML = '';
    const dout = document.getElementById('decrypt-output');
    if (dout) dout.innerHTML = '';
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
        <span class="tag tag-accent">Cost: ${c.cost}</span>
        <span class="tag ${c.security >= 7 ? 'tag-success' : c.security >= 4 ? 'tag-warning' : 'tag-danger'}">Security: ${c.security}</span>
    `;
    // Use the expanded description from our local table; fall back to the API's.
    document.getElementById('cipher-description').textContent = CIPHER_DESCRIPTIONS[name] || c.description;

    const wikiLink = document.getElementById('cipher-wiki-link');
    if (wikiLink) {
        wikiLink.href = `/wiki#${name}`;
        wikiLink.style.display = '';
    }

    const keyContainer = document.getElementById('key-container');
    try {
        if (name === 'rsa') {
            renderRsaInput(keyContainer);
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
        keyContainer.innerHTML = `
            <label>Key</label>
            <input type="text" id="key-input" placeholder="Enter key">
        `;
    }
}

// ---------------------------------------------------------------------------
// RSA visual input — p, q, e fields + live computation of n, phi, d.
// ---------------------------------------------------------------------------

function renderRsaInput(container) {
    container.innerHTML = `
        <label>RSA Parameters</label>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">
            <div>
                <div style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-dim);margin-bottom:4px">p (prime)</div>
                <input type="number" id="rsa-p" value="11" min="2" oninput="computeRsa()" />
            </div>
            <div>
                <div style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-dim);margin-bottom:4px">q (prime)</div>
                <input type="number" id="rsa-q" value="13" min="2" oninput="computeRsa()" />
            </div>
            <div>
                <div style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-dim);margin-bottom:4px">e (public exp)</div>
                <input type="number" id="rsa-e" value="7" min="2" oninput="computeRsa()" />
            </div>
        </div>
        <div class="field-row mb-2">
            <button class="btn btn-outline btn-sm" onclick="generateKey()"><i class="fa-solid fa-dice"></i> Random primes</button>
        </div>
        <div id="rsa-computed" style="background:var(--bg-panel-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;font-family:var(--font-mono);font-size:0.82rem;line-height:1.7">
            <i class="fa-solid fa-spinner spinner"></i> computing...
        </div>
        <input type="hidden" id="key-input" />
        <div class="hint">Pick two distinct primes p and q, plus a public exponent e that's coprime to (p-1)(q-1). The simulator computes n, phi, and d automatically. For printable ASCII to encrypt cleanly, n must be > 127.</div>
    `;
    computeRsa();
}

async function computeRsa() {
    const p = parseInt(document.getElementById('rsa-p')?.value || '0');
    const q = parseInt(document.getElementById('rsa-q')?.value || '0');
    const e = parseInt(document.getElementById('rsa-e')?.value || '0');
    const out = document.getElementById('rsa-computed');
    const hidden = document.getElementById('key-input');
    if (!out || !hidden) return;

    if (!p || !q || !e) {
        out.innerHTML = '<span style="color:var(--text-muted)">Enter p, q, and e to compute n, phi, d.</span>';
        return;
    }

    const r = await apiPost('/api/rsa/compute', {p, q, e});
    if (r.error) {
        out.innerHTML = `<span style="color:var(--danger)"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(r.error)}</span>`;
        hidden.value = '';
        return;
    }
    out.innerHTML = `
        <div><span style="color:var(--text-dim)">n = p × q =</span> <b style="color:var(--accent)">${r.n}</b></div>
        <div><span style="color:var(--text-dim)">phi(n) = (p-1)(q-1) =</span> <b>${r.phi}</b></div>
        <div><span style="color:var(--text-dim)">d = e⁻¹ mod phi =</span> <b style="color:var(--accent)">${r.d}</b></div>
        <div style="margin-top:6px;padding-top:6px;border-top:1px dashed var(--border)">
            <span style="color:var(--text-dim)">Public key:</span> (e=${r.e}, n=${r.n})<br>
            <span style="color:var(--text-dim)">Private key:</span> (d=${r.d}, n=${r.n})
        </div>
    `;
    hidden.value = JSON.stringify({p, q, e});
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
                        <button class="lfsr-tap-btn ${lfsrState.taps.has(i) ? 'active' : ''}" onclick="toggleTap(${i})">Tap</button>
                        <input type="text" class="lfsr-bit-input" maxlength="1" value="${lfsrState.bits[i]}" oninput="updateLfsrBit(${i}, this.value)" />
                        <div class="lfsr-cell-label">Bit ${i}</div>
                    </div>
                `).join('')}
            </div>
            <div class="lfsr-feedback">
                <i class="fa-solid fa-arrows-rotate" style="color:var(--accent)"></i>
                Next bit = XOR of tapped bits = <b id="lfsr-feedback-val">${computeFeedback()}</b>
            </div>
        </div>
        <input type="hidden" id="key-input" />
        <div class="hint">Click <b>Tap</b> above any bit to toggle whether that bit feeds back. The seed goes in the big boxes.</div>
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
                        <div class="perm-cell-label">Position ${i}</div>
                        <input type="text" class="perm-cell-input" maxlength="1" value="${v}" oninput="updatePermKey(this)" />
                    </div>
                `).join('')}
            </div>
        </div>
        <input type="hidden" id="key-input" value='${JSON.stringify(perm)}' />
        <div class="hint">Each number says where that position's byte goes. Click <b>Random</b> for a valid shuffle.</div>
        <button class="btn btn-outline btn-sm mt-2" onclick="generateKey()"><i class="fa-solid fa-dice"></i> Random permutation</button>
    `;
}

function updatePermKey(inputEl) {
    // Allow only digits 0-7.
    let v = (inputEl.value || '').replace(/[^0-7]/g, '').slice(0, 1);
    inputEl.value = v;
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
// Encrypt / decrypt with human-friendly error mapping.
// ---------------------------------------------------------------------------

function humanizeError(cipher, op, err) {
    const e = (err || '').toLowerCase();
    if (e.includes('not prime') || e.includes('p =') && e.includes('not prime')) {
        if (e.includes('p =')) return `The value you entered for p is not a prime number. Try a prime like 11, 13, 17, 19, or 23.`;
        if (e.includes('q =')) return `The value you entered for q is not a prime number. Try a prime like 11, 13, 17, 19, or 23.`;
        return 'Both p and q must be prime numbers. Primes are numbers divisible only by 1 and themselves (2, 3, 5, 7, 11, 13, ...).';
    }
    if (e.includes('must be different primes')) {
        return 'p and q must be different primes. Using the same prime twice makes RSA insecure.';
    }
    if (e.includes('not coprime') || e.includes('coprime')) {
        return 'The public exponent e must be coprime with phi(n) = (p-1)(q-1). That means they share no common factors. Try e = 3, 5, 7, 11, 13, or 17.';
    }
    if (e.includes('too small') && e.includes('n')) {
        return 'The product n = p × q is too small — it must be greater than 127 so all printable ASCII characters can be encrypted. Try larger primes.';
    }
    if (e.includes('byte') && e.includes('>=') && e.includes('n')) {
        return `Your message contains a character whose code is larger than n. Use larger primes so n > 255, or remove non-ASCII characters from your message.`;
    }
    if (e.includes('no modular inverse')) {
        return 'Could not compute the private key d. This happens when e is not coprime with phi(n). Try a different value for e.';
    }
    if (e.includes('invalid literal for int') || e.includes('could not convert')) {
        return `The key format is wrong. ${cipher === 'shift' ? 'For Shift, the key must be a number like 7.' : cipher === 'rail_fence' ? 'For Rail Fence, the key must be a number like 3.' : 'Check the key format hint above.'}`;
    }
    if (e.includes('must be 8') || e.includes('length') && e.includes('8')) {
        return 'The Feistel key must be an 8-bit binary string (eight 0s and 1s), like "11001010".';
    }
    if (e.includes('must be 16') || e.includes('length') && e.includes('16')) {
        return 'The AES key must be a 16-bit binary string (sixteen 0s and 1s), like "1100101011110000".';
    }
    if (e.includes('index out of range') || e.includes('list index')) {
        return 'One of the permutation values is out of range. Each value must be between 0 and 7.';
    }
    if (e.includes('key') && e.includes('not found') || e.includes('keyerror')) {
        return 'The substitution map is missing an entry. Click "Random" to generate a complete map.';
    }
    if (e.includes('invalid') && e.includes('hex')) {
        return 'The ciphertext is not valid hex. It should look like "5E 51 4D 4D 72 2B" — pairs of hex digits separated by spaces.';
    }
    if (e.includes('seed') && e.includes('length') || e.includes('taps')) {
        return 'The LFSR configuration is invalid. Tap positions must be smaller than the seed length.';
    }
    if (e.includes('empty') || e.includes('no input')) {
        return 'Please enter both a message and a key.';
    }
    // Fallback: show the raw error but in friendlier wording.
    return `Something went wrong: ${err}. Check the key format hint above and try again.`;
}

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
    if (selectedCipher === 'rsa') {
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return null; }
    }
    if (selectedCipher === 'shift' || selectedCipher === 'rail_fence') {
        const v = parseInt(raw);
        return isNaN(v) ? null : v;
    }
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
    if (selectedCipher === 'rsa' && key === null) {
        showEncryptError('Please enter valid p, q, and e values first.');
        return;
    }
    const r = await apiPost('/api/cipher/encrypt', {cipher: selectedCipher, text, key});
    if (r.error) { showEncryptError(humanizeError(selectedCipher, 'encrypt', r.error)); return; }
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
    if (selectedCipher === 'rsa' && key === null) {
        showDecryptError('Please enter valid p, q, and e values first.');
        return;
    }
    const r = await apiPost('/api/cipher/decrypt', {cipher: selectedCipher, text, key});
    if (r.error) { showDecryptError(humanizeError(selectedCipher, 'decrypt', r.error)); return; }
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
    if (selectedCipher === 'rsa') {
        // Populate the p, q, e fields and recompute.
        document.getElementById('rsa-p').value = r.key.p;
        document.getElementById('rsa-q').value = r.key.q;
        document.getElementById('rsa-e').value = r.key.e;
        computeRsa();
    } else if (selectedCipher === 'stream') {
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
