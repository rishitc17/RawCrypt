// Simulation page logic.
// Connects to the WebSocket, renders the agent canvas, drives the
// controls, log panel, phone modal, and attacker panel.

// ---------------------------------------------------------------------------
// Global state.
// ---------------------------------------------------------------------------

const state = {
    ws: null,
    running: false,
    config: {
        num_communicators: 4,
        num_attackers: 2,
        attacker_temperature: 1.0,
        communicator_temperature: 1.2,
        tick_interval: 0.9,
    },
    agents: [],         // [{name, role, idx, x, y, color}]
    events: [],         // recent events
    stats: null,        // latest stats payload
    // Visual ephemeral state: animations currently in flight.
    animations: [],     // {kind, startTime, duration, from, to, color, ...}
    // Filters for log panel.
    filters: {
        agent: '', cipher: '', attack: '', outcome: 'all',
    },
};

// ---------------------------------------------------------------------------
// Canvas setup.
// ---------------------------------------------------------------------------

const canvas = document.getElementById('sim-canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layoutAgents();
}
window.addEventListener('resize', resizeCanvas);

// ---------------------------------------------------------------------------
// Agent layout — communicators in an outer circle, attackers in inner cluster.
// ---------------------------------------------------------------------------

function layoutAgents() {
    const w = canvas.offsetWidth, h = canvas.offsetHeight;
    const cx = w / 2, cy = h / 2;
    const comms = state.agents.filter(a => a.role === 'communicator');
    const atks = state.agents.filter(a => a.role === 'attacker');

    const outerR = Math.min(w, h) * 0.38;
    comms.forEach((a, i) => {
        const angle = (i / comms.length) * Math.PI * 2 - Math.PI / 2;
        a.x = cx + Math.cos(angle) * outerR;
        a.y = cy + Math.sin(angle) * outerR;
    });

    const innerR = Math.min(w, h) * 0.12;
    atks.forEach((a, i) => {
        const angle = (i / atks.length) * Math.PI * 2 - Math.PI / 2;
        a.x = cx + Math.cos(angle) * innerR;
        a.y = cy + Math.sin(angle) * innerR;
    });
}

function rebuildAgents(stats) {
    // Build the agent list from stats, preserving positions for agents that already existed.
    const oldByName = {};
    state.agents.forEach(a => { oldByName[a.name] = a; });
    const next = [];
    let commIdx = 0, atkIdx = 0;
    (stats.communicators || []).forEach(c => {
        const old = oldByName[c.name];
        next.push({
            name: c.name, role: 'communicator', idx: commIdx,
            x: old ? old.x : 0, y: old ? old.y : 0,
            color: commColor(commIdx),
            sent: c.sent, broken: c.broken,
            topActions: c.top_actions,
        });
        commIdx++;
    });
    (stats.attackers || []).forEach(a => {
        const old = oldByName[a.name];
        next.push({
            name: a.name, role: 'attacker', idx: atkIdx,
            x: old ? old.x : 0, y: old ? old.y : 0,
            color: atkColor(atkIdx),
            attempts: a.attempts, success: a.success,
            topActions: a.top_actions,
        });
        atkIdx++;
    });
    state.agents = next;
    layoutAgents();
    renderRoster();
}

// ---------------------------------------------------------------------------
// Canvas rendering — runs every frame via requestAnimationFrame.
// ---------------------------------------------------------------------------

const AGENT_RADIUS = 28;

function render() {
    const w = canvas.offsetWidth, h = canvas.offsetHeight;
    ctx.clearRect(0, 0, w, h);

    // Draw connections (arrows + attack lines) beneath the agents.
    const now = performance.now();
    state.animations = state.animations.filter(anim => {
        const elapsed = now - anim.startTime;
        if (elapsed > anim.duration) return false;
        drawAnimation(anim, elapsed);
        return true;
    });

    // Draw agents on top.
    state.agents.forEach(a => drawAgent(a));

    requestAnimationFrame(render);
}

function drawAgent(a) {
    // Outer ring
    ctx.beginPath();
    ctx.arc(a.x, a.y, AGENT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = a.color;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = currentThemeIsDark() ? '#1c1c1c' : '#ffffff';
    ctx.stroke();

    // Initials
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(a.name), a.x, a.y);

    // Name label below
    ctx.fillStyle = cssVar('--text');
    ctx.font = '600 11px Inter, sans-serif';
    ctx.fillText(a.name, a.x, a.y + AGENT_RADIUS + 14);

    // Role icon above
    ctx.font = '12px "Font Awesome 6 Free"';
    ctx.fillStyle = a.role === 'attacker' ? '#ff4d4d' : cssVar('--text-muted');
    // FontAwesome glyphs are awkward to draw on canvas — use a small text label instead.
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText(a.role === 'attacker' ? '☠ ATTACKER' : '✉ COMM', a.x, a.y - AGENT_RADIUS - 10);
}

function drawAnimation(anim, elapsed) {
    const progress = Math.min(1, elapsed / anim.duration);
    if (anim.kind === 'send') {
        // Animated arrow from sender to target.
        const from = anim.from, to = anim.to;
        const cx = (from.x + to.x) / 2;
        const cy = (from.y + to.y) / 2;
        const dx = to.x - from.x, dy = to.y - from.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        // Shorten the line so it doesn't disappear under the agent avatars.
        const ux = dx / dist, uy = dy / dist;
        const sx = from.x + ux * (AGENT_RADIUS + 4);
        const sy = from.y + uy * (AGENT_RADIUS + 4);
        const ex = to.x - ux * (AGENT_RADIUS + 8);
        const ey = to.y - uy * (AGENT_RADIUS + 8);

        // Draw the arrow line, fading out near the end.
        const alpha = 1 - Math.pow(progress, 2);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = anim.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Arrowhead at the target end.
        const angle = Math.atan2(dy, dx);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - 10 * Math.cos(angle - 0.4), ey - 10 * Math.sin(angle - 0.4));
        ctx.lineTo(ex - 10 * Math.cos(angle + 0.4), ey - 10 * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fillStyle = anim.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
        ctx.fill();

        // Small moving dot to show direction.
        const t = Math.min(1, progress * 1.5);
        const px = sx + (ex - sx) * t;
        const py = sy + (ey - sy) * t;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fillStyle = anim.color;
        ctx.globalAlpha = alpha;
        ctx.fill();
        ctx.globalAlpha = 1;
    } else if (anim.kind === 'attack') {
        // Dashed line from attacker to the sender of the attacked message.
        const from = anim.from, to = anim.to;
        const sx = from.x, sy = from.y;
        const ex = to.x, ey = to.y;
        const alpha = 1 - Math.pow(progress, 2);
        ctx.beginPath();
        ctx.setLineDash([6, 4]);
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = anim.success ? cssVar('--success') : cssVar('--danger');
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);

        // Big circular flash on the target.
        const flashRadius = 20 + progress * 30;
        ctx.beginPath();
        ctx.arc(ex, ey, flashRadius, 0, Math.PI * 2);
        ctx.strokeStyle = anim.success ? cssVar('--success') : cssVar('--danger');
        ctx.lineWidth = 3;
        ctx.globalAlpha = alpha * 0.8;
        ctx.stroke();

        // Skull or checkmark icon next to the target.
        ctx.font = 'bold 18px Inter, sans-serif';
        ctx.fillStyle = anim.success ? cssVar('--success') : cssVar('--danger');
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'left';
        ctx.fillText(anim.success ? '☠' : '✓', ex + 20, ey - 20);
        ctx.globalAlpha = 1;
    }
}

function findAgent(name) {
    return state.agents.find(a => a.name === name);
}

// ---------------------------------------------------------------------------
// Process incoming events — push animations + append to log.
// ---------------------------------------------------------------------------

function processTick(payload) {
    state.events = state.events.concat(payload.events).slice(-200);
    (payload.events || []).forEach(ev => {
        if (ev.kind === 'send') {
            const from = findAgent(ev.sender);
            const to = findAgent(ev.target);
            if (from && to) {
                // Color the arrow by cipher.
                const colorMap = {
                    shift: '#00bcd4', rail_fence: '#00e5ff', permutation: '#2196f3',
                    vigenere: '#3b82f6', substitution: '#a855f7', stream: '#d946ef',
                    feistel: '#eab308', aes: '#f59e0b', rsa: '#22c55e',
                };
                state.animations.push({
                    kind: 'send', startTime: performance.now(), duration: 1500,
                    from: {x: from.x, y: from.y}, to: {x: to.x, y: to.y},
                    color: colorMap[ev.cipher] || cssVar('--text-muted'),
                });
            }
        } else if (ev.kind === 'intercepted' || ev.kind === 'secure') {
            const atk = findAgent(ev.attacker);
            const tgt = findAgent(ev.sender);
            if (atk && tgt) {
                state.animations.push({
                    kind: 'attack', startTime: performance.now(), duration: 1200,
                    from: {x: atk.x, y: atk.y}, to: {x: tgt.x, y: tgt.y},
                    success: ev.kind === 'intercepted',
                });
            }
        }
    });
    state.stats = payload.stats;
    rebuildAgents(payload.stats);
    updateStatsPanels();
    renderLog();
}

function processSnapshot(payload) {
    state.events = payload.recent_events || [];
    state.stats = payload.stats;
    state.config = payload.config;
    state.running = payload.running;
    rebuildAgents(payload.stats);
    updateStatsPanels();
    renderLog();
    updateControlUI();
}

// ---------------------------------------------------------------------------
// WebSocket connection with auto-reconnect.
// ---------------------------------------------------------------------------

function connect() {
    state.ws = new WebSocket(wsUrl('/ws/sim'));
    state.ws.onopen = () => {
        document.getElementById('ws-status').className = 'badge badge-success';
        document.getElementById('ws-status').innerHTML = '<i class="fa-solid fa-circle" style="font-size:0.5rem"></i> live';
    };
    state.ws.onclose = () => {
        document.getElementById('ws-status').className = 'badge badge-danger';
        document.getElementById('ws-status').innerHTML = '<i class="fa-solid fa-circle" style="font-size:0.5rem"></i> offline';
        setTimeout(connect, 1500);
    };
    state.ws.onerror = () => { state.ws.close(); };
    state.ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.type === 'snapshot') processSnapshot(data);
        else if (data.type === 'tick') processTick(data);
    };
}

// ---------------------------------------------------------------------------
// Sim control: start / pause / reset / live tune.
// ---------------------------------------------------------------------------

async function simStart() {
    await apiPost('/api/sim/start', {});
    state.running = true;
    updateControlUI();
}

async function simPause() {
    await apiPost('/api/sim/pause', {});
    state.running = false;
    updateControlUI();
}

async function simReset() {
    const cfg = {
        num_communicators: parseInt(document.getElementById('num-comms').value),
        num_attackers: parseInt(document.getElementById('num-atks').value),
        attacker_temperature: parseFloat(document.getElementById('atk-temp').value),
        communicator_temperature: parseFloat(document.getElementById('comm-temp').value),
        tick_interval: parseFloat(document.getElementById('tick-interval').value),
        seed: parseInt(document.getElementById('seed').value) || null,
    };
    await apiPost('/api/sim/reset', cfg);
    state.config = cfg;
}

async function liveTune(field, value) {
    await apiPost('/api/sim/tune', {[field]: value});
}

function updateControlUI() {
    const startBtn = document.getElementById('btn-start');
    const pauseBtn = document.getElementById('btn-pause');
    if (state.running) {
        startBtn.style.display = 'none';
        pauseBtn.style.display = 'inline-flex';
    } else {
        startBtn.style.display = 'inline-flex';
        pauseBtn.style.display = 'none';
    }
    document.getElementById('num-comms').value = state.config.num_communicators;
    document.getElementById('num-atks').value = state.config.num_attackers;
    document.getElementById('atk-temp').value = state.config.attacker_temperature;
    document.getElementById('comm-temp').value = state.config.communicator_temperature;
    document.getElementById('tick-interval').value = state.config.tick_interval;
    document.getElementById('num-comms-val').textContent = state.config.num_communicators;
    document.getElementById('num-atks-val').textContent = state.config.num_attackers;
    document.getElementById('atk-temp-val').textContent = state.config.attacker_temperature.toFixed(2);
    document.getElementById('comm-temp-val').textContent = state.config.communicator_temperature.toFixed(2);
    document.getElementById('tick-interval-val').textContent = state.config.tick_interval.toFixed(2) + 's';
}

// ---------------------------------------------------------------------------
// Stats panels.
// ---------------------------------------------------------------------------

function updateStatsPanels() {
    if (!state.stats) return;
    const s = state.stats;

    // Summary cards.
    document.getElementById('stat-tick').textContent = s.summary.tick;
    document.getElementById('stat-messages').textContent = s.summary.total_messages;
    document.getElementById('stat-survival').textContent = s.summary.overall_survival_pct.toFixed(1) + '%';
    document.getElementById('stat-ciphers').textContent = s.summary.distinct_ciphers_used;

    // Cipher usage table.
    const cipherRows = (s.cipher_usage || [])
        .map(c => ({...c, usage_pct: s.summary.total_messages ? 100 * c.used / s.summary.total_messages : 0,
                     break_pct: c.used ? 100 * c.broken / c.used : 0}))
        .filter(c => c.used > 0)
        .sort((a, b) => b.used - a.used);
    document.getElementById('cipher-usage-table').innerHTML = cipherRows.map(c => `
        <tr>
            <td><span class="cipher-pill pill-${c.name}">${c.name}</span></td>
            <td>${c.used}</td>
            <td>${c.usage_pct.toFixed(1)}%</td>
            <td>${c.broken}</td>
            <td>${c.break_pct.toFixed(1)}%</td>
            <td style="width:80px;"><div class="usage-bar"><div style="width:${c.usage_pct}%;background:${cipherColorFor(c.name)}"></div></div></td>
        </tr>
    `).join('') || '<tr><td colspan="6" class="text-muted text-center">No messages yet.</td></tr>';

    // Attack usage table.
    const totalAtks = (s.attack_usage || []).reduce((sum, a) => sum + a.used, 0);
    const atkRows = (s.attack_usage || [])
        .map(a => ({...a, usage_pct: totalAtks ? 100 * a.used / totalAtks : 0,
                     succ_pct: a.used ? 100 * a.success / a.used : 0}))
        .filter(a => a.used > 0)
        .sort((a, b) => b.used - a.used);
    document.getElementById('attack-usage-table').innerHTML = atkRows.map(a => `
        <tr>
            <td><span class="attack-pill pill-${a.name}">${a.name}</span></td>
            <td>${a.used}</td>
            <td>${a.usage_pct.toFixed(1)}%</td>
            <td>${a.success}</td>
            <td>${a.succ_pct.toFixed(1)}%</td>
            <td style="width:80px;"><div class="usage-bar"><div style="width:${a.succ_pct}%;background:${attackColorFor(a.name)}"></div></div></td>
        </tr>
    `).join('') || '<tr><td colspan="6" class="text-muted text-center">No attacks yet.</td></tr>';
}

function cipherColorFor(name) {
    return {shift:'#00bcd4', rail_fence:'#00e5ff', permutation:'#2196f3',
            vigenere:'#3b82f6', substitution:'#a855f7', stream:'#d946ef',
            feistel:'#eab308', aes:'#f59e0b', rsa:'#22c55e'}[name] || '#888';
}
function attackColorFor(name) {
    return {brute_force:'#ef4444', frequency:'#f87171',
            known_plaintext:'#facc15', dictionary:'#fde047'}[name] || '#888';
}

// ---------------------------------------------------------------------------
// Agent roster panel.
// ---------------------------------------------------------------------------

function renderRoster() {
    const html = state.agents.map(a => {
        const top = (a.topActions || []).slice(0, 3)
            .map(([name, prob]) => `<span class="badge" style="background:${a.role==='attacker'?attackColorFor(name):cipherColorFor(name)}22;color:${a.role==='attacker'?attackColorFor(name):cipherColorFor(name)}">${name} ${(prob*100).toFixed(0)}%</span>`).join(' ');
        return `
            <div class="phone-list-item" onclick="openAgent('${a.name}','${a.role}')">
                <div class="avatar" style="background:${a.color}">${initials(a.name)}</div>
                <div class="info">
                    <div class="name">${a.name}</div>
                    <div class="preview">${top || '<span class="text-muted">no data yet</span>'}</div>
                </div>
                <div class="meta">
                    ${a.role === 'attacker'
                        ? `${a.attempts||0} atk<br>${a.success||0} wins`
                        : `${a.sent||0} sent<br>${(a.sent||0)-(a.broken||0)} ok`}
                </div>
            </div>
        `;
    }).join('');
    document.getElementById('agent-roster').innerHTML = html || '<div class="empty-state"><i class="fa-solid fa-users-slash"></i><div>Waiting for agents...</div></div>';
}

// ---------------------------------------------------------------------------
// Log panel — collapsible + filterable.
// ---------------------------------------------------------------------------

function renderLog() {
    const container = document.getElementById('log-entries');
    if (!container) return;
    let events = state.events.slice().reverse();

    // Apply filters.
    const f = state.filters;
    if (f.agent) events = events.filter(e =>
        e.sender === f.agent || e.target === f.agent || e.attacker === f.agent);
    if (f.cipher) events = events.filter(e => e.cipher === f.cipher);
    if (f.attack) events = events.filter(e => e.attack === f.attack);
    if (f.outcome === 'success') events = events.filter(e => e.kind === 'intercepted');
    if (f.outcome === 'failed') events = events.filter(e => e.kind === 'secure');
    if (f.outcome === 'send') events = events.filter(e => e.kind === 'send');

    events = events.slice(0, 100);

    container.innerHTML = events.map(ev => {
        let cls = ev.kind;
        let icon = 'fa-message';
        if (ev.kind === 'send') icon = 'fa-paper-plane';
        else if (ev.kind === 'intercepted') icon = 'fa-skull-crossbones';
        else if (ev.kind === 'secure') icon = 'fa-shield-halved';
        else if (ev.kind === 'skip') icon = 'fa-forward';
        return `
            <div class="log-entry ${cls}">
                <span class="tick">T${ev.tick}</span>
                <i class="fa-solid ${icon}" style="width:14px"></i>
                ${ev.kind === 'send'
                    ? `<span><b>${ev.sender}</b> → <b>${ev.target}</b> ${ev.cipher ? cipherPill(ev.cipher) : ''} <span class="text-muted">"${ev.message_preview}"</span></span>`
                    : ev.kind === 'intercepted'
                    ? `<span><b>${ev.attacker}</b> broke <b>${ev.sender}</b>'s ${ev.cipher ? cipherPill(ev.cipher) : ''} via ${ev.attack ? attackPill(ev.attack) : ''} <span class="text-muted">(${ev.notes})</span></span>`
                    : ev.kind === 'secure'
                    ? `<span><b>${ev.attacker}</b> failed on <b>${ev.sender}</b>'s ${ev.cipher ? cipherPill(ev.cipher) : ''} ${ev.attack ? attackPill(ev.attack) : ''} <span class="text-muted">(${ev.notes})</span></span>`
                    : `<span><b>${ev.attacker}</b> skipped <b>${ev.sender}</b>'s ${ev.cipher ? cipherPill(ev.cipher) : ''}</span>`}
            </div>
        `;
    }).join('') || '<div class="empty-state"><i class="fa-solid fa-inbox"></i><div>No events match the filters.</div></div>';
}

function toggleLogPanel() {
    document.getElementById('log-panel').classList.toggle('collapsed');
}

function setFilter(key, val) {
    state.filters[key] = val;
    renderLog();
}

// ---------------------------------------------------------------------------
// Phone modal (communicator) and attacker panel.
// ---------------------------------------------------------------------------

async function openAgent(name, role) {
    if (role === 'communicator') await openPhone(name);
    else await openAttackerPanel(name);
}

async function openPhone(name) {
    const data = await apiGet(`/api/sim/agent/${encodeURIComponent(name)}/chat`);
    const modal = document.getElementById('phone-modal');
    const header = modal.querySelector('.phone-header');
    const body = modal.querySelector('.phone-body');

    header.classList.remove('show-back');
    header.querySelector('.avatar').textContent = initials(name);
    header.querySelector('.avatar').style.background = '';
    header.querySelector('.name').textContent = name;
    header.querySelector('.status').textContent = 'communicator • online';

    // Render contact list.
    const contacts = Object.keys(data.contacts || {});
    if (contacts.length === 0) {
        body.innerHTML = '<div class="empty-state"><i class="fa-solid fa-comments"></i><div>No messages sent yet.</div></div>';
    } else {
        body.innerHTML = contacts.map(c => {
            const msgs = data.contacts[c];
            const last = msgs[msgs.length - 1];
            const preview = last.plaintext.slice(0, 30);
            const intercepted = msgs.some(m => m.broken);
            return `
                <div class="phone-list-item" onclick="openChat('${name}','${c}')">
                    <div class="avatar" style="background:${colorForAgent(c, 'communicator', 0)}">${initials(c)}</div>
                    <div class="info">
                        <div class="name">${c} ${intercepted ? '<i class="fa-solid fa-triangle-exclamation" style="color:var(--danger)" title="Some messages were intercepted"></i>' : ''}</div>
                        <div class="preview">${preview}</div>
                    </div>
                    <div class="meta">T${last.tick}</div>
                </div>
            `;
        }).join('');
    }
    modal.classList.add('open');
    modal.dataset.currentAgent = name;
    modal.dataset.currentContact = '';
}

async function openChat(agentName, contactName) {
    const data = await apiGet(`/api/sim/agent/${encodeURIComponent(agentName)}/chat`);
    const modal = document.getElementById('phone-modal');
    const header = modal.querySelector('.phone-header');
    const body = modal.querySelector('.phone-body');

    header.classList.add('show-back');
    header.querySelector('.name').textContent = contactName;
    header.querySelector('.status').textContent = `chat with ${agentName}`;

    const msgs = data.contacts[contactName] || [];
    if (msgs.length === 0) {
        body.innerHTML = '<div class="empty-state"><i class="fa-solid fa-comment-slash"></i><div>No messages in this conversation.</div></div>';
        return;
    }

    let lastTick = -10;
    body.innerHTML = msgs.map(m => {
        const tickDivider = (m.tick - lastTick > 5) ? `<div class="chat-day-divider">Tick ${m.tick}</div>` : '';
        lastTick = m.tick;
        const cls = m.direction === 'out' ? 'out' : 'in';
        const interceptedBanner = m.broken
            ? `<div class="intercepted-banner"><i class="fa-solid fa-skull-crossbones"></i> INTERCEPTED by ${m.intercepted_by} via ${m.attack}</div>`
            : (m.intercepted_by && !m.broken)
            ? `<div class="intercepted-banner" style="background:var(--success)"><i class="fa-solid fa-shield-halved"></i> ATTACKED by ${m.intercepted_by} — survived</div>`
            : '';
        return `
            ${tickDivider}
            <div class="chat-bubble ${cls} ${m.broken ? 'intercepted' : ''}">
                ${interceptedBanner}
                <div class="cipher-tag">${m.cipher}</div>
                <div>${escapeHtml(m.plaintext)}</div>
                <div class="ciphertext">${m.ciphertext}</div>
                <div class="tick">T${m.tick} • L${m.security_level}</div>
            </div>
        `;
    }).join('');
    body.scrollTop = body.scrollHeight;
    modal.dataset.currentContact = contactName;
}

async function openAttackerPanel(name) {
    const data = await apiGet(`/api/sim/agent/${encodeURIComponent(name)}/attacks`);
    const modal = document.getElementById('attacker-modal');
    const body = modal.querySelector('.modal-body');
    modal.querySelector('.modal-title').textContent = `${name} — attacker log`;

    const attempts = data.attempts || [];
    if (attempts.length === 0) {
        body.innerHTML = '<div class="empty-state"><i class="fa-solid fa-satellite-dish"></i><div>No attacks yet.</div></div>';
    } else {
        body.innerHTML = attempts.slice().reverse().map(a => `
            <div class="card mb-2" style="padding:14px;${a.success ? 'border-left:3px solid var(--danger)' : a.skipped ? 'border-left:3px solid var(--text-dim)' : 'border-left:3px solid var(--success)'}">
                <div class="flex items-center justify-between mb-1">
                    <div>
                        <span class="badge ${a.success ? 'badge-danger' : a.skipped ? '' : 'badge-success'}">
                            <i class="fa-solid ${a.success ? 'fa-skull-crossbones' : a.skipped ? 'fa-forward' : 'fa-shield-halved'}"></i>
                            ${a.success ? 'BROKEN' : a.skipped ? 'SKIPPED' : 'SURVIVED'}
                        </span>
                        T${a.tick} • <b>${a.sender}</b> → <b>${a.target}</b>
                    </div>
                    <div>${a.cipher ? cipherPill(a.cipher) : ''} ${a.attack ? attackPill(a.attack) : ''}</div>
                </div>
                ${a.ciphertext ? `<div class="code-block" style="margin:8px 0;font-size:0.78rem">${a.ciphertext}</div>` : ''}
                ${a.plaintext ? `<div class="text-muted" style="font-size:0.85rem"><b>Recovered:</b> ${escapeHtml(a.plaintext)}</div>` : ''}
                <div class="text-muted" style="font-size:0.78rem;margin-top:4px">${a.notes}</div>
            </div>
        `).join('');
    }
    modal.classList.add('open');
}

function closePhone() {
    const modal = document.getElementById('phone-modal');
    const header = modal.querySelector('.phone-header');
    if (modal.dataset.currentContact) {
        // Go back to contact list.
        modal.dataset.currentContact = '';
        header.classList.remove('show-back');
        openPhone(modal.dataset.currentAgent);
    } else {
        modal.classList.remove('open');
    }
}

function closeAttacker() {
    document.getElementById('attacker-modal').classList.remove('open');
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}

// ---------------------------------------------------------------------------
// Wire up controls and start the show.
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    resizeCanvas();
    requestAnimationFrame(render);
    connect();

    // Control buttons.
    document.getElementById('btn-start').onclick = simStart;
    document.getElementById('btn-pause').onclick = simPause;
    document.getElementById('btn-reset').onclick = simReset;

    // Live-tunable sliders.
    document.getElementById('atk-temp').oninput = e => {
        const v = parseFloat(e.target.value);
        document.getElementById('atk-temp-val').textContent = v.toFixed(2);
        liveTune('attacker_temperature', v);
    };
    document.getElementById('comm-temp').oninput = e => {
        const v = parseFloat(e.target.value);
        document.getElementById('comm-temp-val').textContent = v.toFixed(2);
        liveTune('communicator_temperature', v);
    };
    document.getElementById('tick-interval').oninput = e => {
        const v = parseFloat(e.target.value);
        document.getElementById('tick-interval-val').textContent = v.toFixed(2) + 's';
        liveTune('tick_interval', v);
    };

    // Reset-requiring sliders.
    document.getElementById('num-comms').oninput = e => {
        document.getElementById('num-comms-val').textContent = e.target.value;
    };
    document.getElementById('num-atks').oninput = e => {
        document.getElementById('num-atks-val').textContent = e.target.value;
    };

    // Log panel toggle.
    document.getElementById('log-header').onclick = toggleLogPanel;

    // Filter dropdowns.
    document.getElementById('filter-agent').onchange = e => setFilter('agent', e.target.value);
    document.getElementById('filter-cipher').onchange = e => setFilter('cipher', e.target.value);
    document.getElementById('filter-attack').onchange = e => setFilter('attack', e.target.value);
    document.getElementById('filter-outcome').onchange = e => setFilter('outcome', e.target.value);

    // Modal close buttons.
    document.getElementById('phone-back').onclick = closePhone;
    document.getElementById('attacker-close').onclick = closeAttacker;
    document.querySelectorAll('.modal-overlay').forEach(o => {
        o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
    });
});
