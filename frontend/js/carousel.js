// RPG-style carousel for the homepage.
// Fetches the cipher + attack lists from the API and builds a duplicated
// track of cards so the animation loops seamlessly.

const CAROUSEL_CARDS = [
    // Ciphers
    {slug:'shift', name:'Shift', type:'Cipher', icon:'fa-i-cursor', color:'#10B981', cost:1, security:1, desc:'Caesar\\'s classic. Each byte nudged forward by a fixed amount.'},
    {slug:'rail_fence', name:'Rail Fence', type:'Cipher', icon:'fa-bars-staggered', color:'#65A30D', cost:1, security:2, desc:'A zig-zag transposition. Cheap but predictable.'},
    {slug:'permutation', name:'Permutation', type:'Cipher', icon:'fa-shuffle', color:'#4F46E5', cost:2, security:3, desc:'8 bytes get shuffled. 40,320 possible shuffles.'},
    {slug:'vigenere', name:'Vigenère', type:'Cipher', icon:'fa-table-cells', color:'#EC4899', cost:2, security:3, desc:'A repeating-key cipher that fooled Europe for 300 years.'},
    {slug:'substitution', name:'Substitution', type:'Cipher', icon:'fa-circle-half-stroke', color:'#EA580C', cost:3, security:4, desc:'Every byte maps to another. Frequency analysis cracks it.'},
    {slug:'stream', name:'Stream', type:'Cipher', icon:'fa-water', color:'#06B6D4', cost:2, security:5, desc:'A pseudo-random keystream XORed with the message.'},
    {slug:'feistel', name:'Feistel', type:'Cipher', icon:'fa-network-wired', color:'#F59E0B', cost:3, security:6, desc:'A 4-round toy network. Same circuit encrypts and decrypts.'},
    {slug:'aes', name:'AES', type:'Cipher', icon:'fa-shield-halved', color:'#2563EB', cost:5, security:8, desc:'2-round toy AES. The real one has 10-14 rounds.'},
    {slug:'rsa', name:'RSA', type:'Cipher', icon:'fa-key', color:'#9333EA', cost:8, security:10, desc:'The only asymmetric cipher. Based on factoring big numbers.'},
    // Attacks
    {slug:'brute_force', name:'Brute Force', type:'Attack', icon:'fa-hammer', color:'#DC2626', cost:4, security:0, desc:'Try every possible key until one works. Slow but always succeeds.'},
    {slug:'frequency', name:'Frequency', type:'Attack', icon:'fa-chart-column', color:'#0D9488', cost:3, security:0, desc:'Use byte-frequency statistics to break substitution ciphers.'},
    {slug:'known_plaintext', name:'Known Plaintext', type:'Attack', icon:'fa-magnifying-glass', color:'#CA8A04', cost:2, security:0, desc:'If you know part of the message, you can often recover the key.'},
    {slug:'dictionary', name:'Dictionary', type:'Attack', icon:'fa-book', color:'#F43F5E', cost:1, security:0, desc:'Try a small list of common, weak keys. Surprisingly effective.'},
];

function buildCarouselCard(card) {
    const wikiSlug = card.type === 'Cipher' ? card.slug : card.slug;
    const statsHtml = card.type === 'Cipher'
        ? `<div class="rpg-card-stats">
             <div class="rpg-stat"><div class="rpg-stat-label">Cost</div><div class="rpg-stat-value" style="color:${card.color}">${card.cost}</div></div>
             <div class="rpg-stat"><div class="rpg-stat-label">Security</div><div class="rpg-stat-value" style="color:${card.color}">${card.security}</div></div>
           </div>`
        : `<div class="rpg-card-stats">
             <div class="rpg-stat"><div class="rpg-stat-label">Cost</div><div class="rpg-stat-value" style="color:${card.color}">${card.cost}</div></div>
           </div>`;
    return `
        <a href="/wiki#${wikiSlug}" class="rpg-card">
            <div class="rpg-card-banner" style="background:${card.color}">
                <i class="fa-solid ${card.icon}"></i>
            </div>
            <div class="rpg-card-body">
                <div class="rpg-card-type">${card.type}</div>
                <div class="rpg-card-name">${card.name}</div>
                <div class="rpg-card-desc">${card.desc}</div>
                ${statsHtml}
            </div>
            <div class="rpg-card-footer">
                <i class="fa-solid fa-book"></i> Wiki
            </div>
        </a>
    `;
}

document.addEventListener('DOMContentLoaded', () => {
    const track = document.getElementById('carousel-track');
    if (!track) return;
    // Duplicate the cards so the animation loops seamlessly (track scrolls
    // -50% which brings the second copy into view).
    const allCards = CAROUSEL_CARDS.concat(CAROUSEL_CARDS);
    track.innerHTML = allCards.map(buildCarouselCard).join('');
});
