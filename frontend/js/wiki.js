// Wiki page logic — fetches term list and renders content based on URL hash.

let terms = [];
let currentTerm = null;

async function loadWiki() {
    terms = await apiGet('/api/wiki');
    renderSidebar();
    // Determine which term to show from URL hash.
    const hash = window.location.hash.slice(1);
    const initial = hash && terms.find(t => t.slug === hash) ? hash : 'plaintext';
    showTerm(initial);
}

function renderSidebar() {
    const html = terms.map(t => `
        <a href="#${t.slug}" class="${currentTerm === t.slug ? 'active' : ''}" onclick="showTerm('${t.slug}')">
            <i class="fa-solid ${t.icon}" style="width:16px;text-align:center"></i>
            ${t.title}
        </a>
    `).join('');
    document.getElementById('wiki-sidebar').innerHTML = `
        <h4>Terms</h4>
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
        const rt = terms.find(x => x.slug === r);
        return rt
            ? `<a href="#${r}" class="badge badge-accent" onclick="showTerm('${r}')">${rt.title}</a>`
            : `<span class="badge">${r}</span>`;
    }).join(' ');

    // Render body paragraphs (split on \n\n).
    const bodyHtml = (t.body || '').split(/\n\n+/).map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');

    document.getElementById('wiki-content').innerHTML = `
        <h1><i class="fa-solid ${t.icon}"></i> ${t.title}</h1>
        <div class="summary">${t.summary}</div>
        <div class="body">${bodyHtml}</div>
        ${t.example ? `<div class="example-block">${escapeHtml(t.example)}</div>` : ''}
        <div class="related">
            <h4>Related terms</h4>
            <div class="related-tags">${related}</div>
        </div>
    `;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}

document.addEventListener('DOMContentLoaded', loadWiki);
