// Wiki page logic.

let wikiData = null;
let currentTerm = null;

const CIPHER_SLUGS = ['shift','rail_fence','permutation','vigenere','substitution','stream','feistel','aes','rsa'];

async function loadWiki() {
    wikiData = await apiGet('/api/wiki');
    renderSidebar();
    const hash = window.location.hash.slice(1);
    const allSlugs = wikiData.terms.map(t => t.slug);
    const initial = hash && allSlugs.includes(hash) ? hash : 'plaintext';
    showTerm(initial);
}

function renderSidebar() {
    const html = (wikiData.categories || []).map(([cat, terms]) => `
        <div class="sidebar-group">
            <div class="sidebar-group-title">${cat}</div>
            ${terms.map(t => `
                <a href="#${t.slug}" class="${currentTerm === t.slug ? 'active' : ''}" onclick="showTerm('${t.slug}')">
                    <i class="fa-solid ${t.icon}"></i> ${t.title}
                </a>
            `).join('')}
        </div>
    `).join('');
    document.getElementById('wiki-sidebar').innerHTML = `
        <div class="sidebar-header">Index</div>
        ${html}
    `;
}

async function showTerm(slug) {
    if (currentTerm === slug) return;
    currentTerm = slug;
    window.location.hash = slug;
    renderSidebar();

    const t = await apiGet(`/api/wiki/${slug}`);
    if (t.error) {
        document.getElementById('wiki-content').innerHTML = `
            <div class="empty-state"><i class="fa-solid fa-circle-question"></i><div>${t.error}</div></div>
        `;
        return;
    }
    const related = (t.related || []).map(r => {
        const rt = wikiData.terms.find(x => x.slug === r);
        return rt
            ? `<a href="#${r}" class="tag tag-accent" onclick="showTerm('${r}')">${rt.title}</a>`
            : `<span class="tag">${r}</span>`;
    }).join(' ');

    const bodyHtml = (t.body || '').split(/\n\n+/).map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');

    // If this is a cipher page, add a "Try in Playground" link.
    const playgroundLink = CIPHER_SLUGS.includes(slug)
        ? `<a href="/playground#${slug}" class="btn btn-primary btn-sm" style="margin-top:16px">
             <i class="fa-solid fa-flask"></i> Try this cipher in the Playground
           </a>`
        : '';

    document.getElementById('wiki-content').innerHTML = `
        <h1><i class="fa-solid ${t.icon}"></i> ${t.title}</h1>
        <div class="summary">${t.summary}</div>
        <div class="body">${bodyHtml}</div>
        ${t.example ? `<div class="example-block">${escapeHtml(t.example)}</div>` : ''}
        ${playgroundLink}
        <div class="related">
            <h4>Related terms</h4>
            <div class="related-tags">${related}</div>
        </div>
    `;
}

document.addEventListener('DOMContentLoaded', loadWiki);
