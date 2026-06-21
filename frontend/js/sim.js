// Simulation page logic.

const state = {
    ws: null,
    running: false,
    config: {
        num_communicators: 4, num_attackers: 2,
        attacker_temperature: 1.0, communicator_temperature: 1.2,
        tick_interval: 0.9,
    },
    agents: [],
    events: [],
    stats: null,
    animations: [],
    pendingAnimations: [],
    filters: { agent: '', cipher: '', attack: '', outcome: 'all' },
    openModal: null,
};

// ---------------------------------------------------------------------------
// Canvas setup.
// ---------------------------------------------------------------------------

const canvas = document.getElementById('sim-canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const wrap = canvas.parentElement;
    const rect = wrap.getBoundingClientRect();
    canvas.width = Math.max(100, rect.width) * dpr;
    canvas.height = Math.max(100, rect.height) * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layoutAgents();
}
window.addEventListener('resize', () => { setTimeout(resizeCanvas, 50); });

// ---------------------------------------------------------------------------
// Agent layout.
// ---------------------------------------------------------------------------

function layoutAgents() {
    const w = canvas.offsetWidth || 600;
    const h = canvas.offsetHeight || 600;
    const cx = w / 2, cy = h / 2;
    const comms = state.agents.filter(a => a.role === 'communicator');
    const atks = state.agents.filter(a => a.role === 'attacker');

    const outerR = Math.min(w, h) * 0.38;
    comms.forEach((a, i) => {
        const angle = (i / Math.max(comms.length, 1)) * Math.PI * 2 - Math.PI / 2;
        a.x = cx + Math.cos(angle) * outerR;
        a.y = cy + Math.sin(angle) * outerR;
    });

    const innerR = Math.min(w, h) * 0.13;
    atks.forEach((a, i) => {
        const angle = (i / Math.max(atks.length, 1)) * Math.PI * 2 - Math.PI / 2;
        a.x = cx + Math.cos(angle) * innerR;
        a.y = cy + Math.sin(angle) * innerR;
    });
}

function rebuildAgents(stats) {
    if (!stats) return;
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
    resetColorCache();
    state.agents.forEach(a => { colorForAgent(a.name, a.role, a.idx); });
    layoutAgents();
    renderRoster();
    updateAgentFilter();
}

// ---------------------------------------------------------------------------
// Rendering — defensive, never stops the rAF loop.
// ---------------------------------------------------------------------------

const AGENT_RADIUS = 26;

function render() {
    try {
        const w = canvas.offsetWidth || 600;
        const h = canvas.offsetHeight || 600;
        ctx.clearRect(0, 0, w, h);

        const now = performance.now();

        // Promote queued animations (respecting stagger start times).
        while (state.pendingAnimations.length > 0 && state.animations.length < 10) {
            const anim = state.pendingAnimations[0];
            if (now >= anim.startTime) {
                state.animations.push(state.pendingAnimations.shift());
            } else {
                break;  // not time yet
            }
        }

        // Draw and filter active animations.
        state.animations = state.animations.filter(anim => {
            const elapsed = now - anim.startTime;
            if (elapsed < 0) return true;   // not started yet
            if (elapsed > anim.duration) return false;
            try { drawAnimation(anim, elapsed); } catch (e) { /* skip broken anim */ }
            return true;
        });

        // Draw agents on top.
        state.agents.forEach(a => { try { drawAgent(a, now); } catch (e) {} });
    } catch (e) {
        // Never let the render loop die.
    }
    requestAnimationFrame(render);
}

function drawAgent(a, now) {
    const pulse = state.animations.some(anim =>
        (anim.fromName === a.name || anim.toName === a.name) &&
        (now - anim.startTime) < 500 && (now - anim.startTime) > 0
    );

    ctx.beginPath();
    ctx.arc(a.x, a.y, AGENT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = a.color;
    ctx.fill();
    ctx.lineWidth = pulse ? 4 : 3;
    ctx.strokeStyle = pulse ? cssVar('--accent') : cssVar('--bg-panel');
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(a.name), a.x, a.y);

    ctx.fillStyle = cssVar('--text');
    ctx.font = '600 11px "IBM Plex Mono", monospace';
    ctx.fillText(a.name, a.x, a.y + AGENT_RADIUS + 14);

    ctx.font = '9px "IBM Plex Mono", monospace';
    ctx.fillStyle = a.role === 'attacker' ? cssVar('--danger') : cssVar('--text-muted');
    ctx.fillText(a.role === 'attacker' ? '▲ HACKER' : '◆ COMM', a.x, a.y - AGENT_RADIUS - 8);
}

function drawAnimation(anim, elapsed) {
    const progress = Math.min(1, Math.max(0, elapsed / anim.duration));
    if (progress <= 0) return;

    if (anim.kind === 'send') {
        const from = anim.from, to = anim.to;
        const dx = to.x - from.x, dy = to.y - from.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 1) return;
        const ux = dx / dist, uy = dy / dist;
        const sx = from.x + ux * (AGENT_RADIUS + 4);
        const sy = from.y + uy * (AGENT_RADIUS + 4);
        const ex = to.x - ux * (AGENT_RADIUS + 8);
        const ey = to.y - uy * (AGENT_RADIUS + 8);

        const alpha = 1 - Math.pow(progress, 2);
        const hex = (anim.color || '#888').replace('#', '');
        const alphaHex = Math.floor(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0');

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = '#' + hex + alphaHex;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        const angle = Math.atan2(dy, dx);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - 10 * Math.cos(angle - 0.4), ey - 10 * Math.sin(angle - 0.4));
        ctx.lineTo(ex - 10 * Math.cos(angle + 0.4), ey - 10 * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fillStyle = '#' + hex + alphaHex;
        ctx.fill();

        const t = Math.min(1, progress * 1.4);
        const px = sx + (ex - sx) * t;
        const py = sy + (ey - sy) * t;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fillStyle = anim.color;
        ctx.globalAlpha = alpha;
        ctx.fill();
        ctx.globalAlpha = 1;
    } else if (anim.kind === 'attack') {
        const from = anim.from, to = anim.to;
        const alpha = 1 - Math.pow(progress, 2);
        const color = anim.success ? cssVar('--success') : cssVar('--danger');

        ctx.beginPath();
        ctx.setLineDash([6, 4]);
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);

        const flashRadius = 20 + progress * 30;
        ctx.beginPath();
        ctx.arc(to.x, to.y, flashRadius, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.globalAlpha = alpha * 0.8;
        ctx.stroke();

        ctx.font = 'bold 22px Inter, sans-serif';
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'left';
        ctx.fillText(anim.success ? '✕' : '✓', to.x + 22, to.y - 18);
        ctx.globalAlpha = 1;
    }
}

function findAgent(name) { return state.agents.find(a => a.name === name); }

// ---------------------------------------------------------------------------
// Process incoming events.
// ---------------------------------------------------------------------------

function processTick(payload) {
    state.events = state.events.concat(payload.events || []).slice(-300);

    // Stagger animations: each event's animation starts after the previous.
    let stagger = 0;
    const STAGGER_MS = 200;
    (payload.events || []).forEach(ev => {
        if (ev.kind === 'send') {
            const from = findAgent(ev.sender);
            const to = findAgent(ev.target);
            if (from && to) {
                state.pendingAnimations.push({
                    kind: 'send',
                    startTime: performance.now() + stagger,
                    duration: 1400,
                    from: {x: from.x, y: from.y}, to: {x: to.x, y: to.y},
                    fromName: from.name, toName: to.name,
                    color: cipherColorFor(ev.cipher),
                });
                stagger += STAGGER_MS;
            }
        } else if (ev.kind === 'intercepted' || ev.kind === 'secure') {
            const atk = findAgent(ev.attacker);
            const tgt = findAgent(ev.sender);
            if (atk && tgt) {
                state.pendingAnimations.push({
                    kind: 'attack',
                    startTime: performance.now() + stagger,
                    duration: 1100,
                    from: {x: atk.x, y: atk.y}, to: {x: tgt.x, y: tgt.y},
                    fromName: atk.name, toName: tgt.name,
                    success: ev.kind === 'intercepted',
                });
                stagger += STAGGER_MS;
            }
        }
    });

    state.stats = payload.stats;
    rebuildAgents(payload.stats);
    updateStatsPanels();
    renderLog();
    refreshOpenModal();
}

function processSnapshot(payload) {
    state.events = payload.recent_events || [];
    state.stats = payload.stats;
    state.config = {
        ...payload.config,
        tick_interval: payload.tick_interval || 0.9,  // FIX: include tick_interval
    };
    state.running = payload.running;
    rebuildAgents(payload.stats);
    updateStatsPanels();
    renderLog();
    updateControlUI();
}

// ---------------------------------------------------------------------------
// WebSocket.
// ---------------------------------------------------------------------------

function connect() {
    state.ws = new WebSocket(wsUrl('/ws/sim'));
    state.ws.onopen = () => {
        const el = document.getElementById('ws-status');
        el.className = 'tag tag-success';
        el.innerHTML = '<i class="fa-solid fa-circle" style="font-size:0.5rem"></i> live';
    };
    state.ws.onclose = () => {
        const el = document.getElementById('ws-status');
        el.className = 'tag tag-danger';
        el.innerHTML = '<i class="fa-solid fa-circle" style="font-size:0.5rem"></i> offline';
        setTimeout(connect, 1500);
    };
    state.ws.onerror = () => { try { state.ws.close(); } catch(e){} };
    state.ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.type === 'snapshot') processSnapshot(data);
        else if (data.type === 'tick') processTick(data);
    };
}

// Pause when user leaves the simulation page.
document.addEventListener('visibilitychange', async () => {
    if (document.hidden && state.running) {
        try { await apiPost('/api/sim/pause', {}); } catch(e){}
        state.running = false;
        updateControlUI();
    }
});
window.addEventListener('pagehide', async () => {
    if (state.running) {
        try { await apiPost('/api/sim/pause', {}); } catch(e){}
        state.running = false;
    }
});

// ---------------------------------------------------------------------------
// Sim control.
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
        tick_interval: 1.0 / parseFloat(document.getElementById('tick-rate').value),
        seed: parseInt(document.getElementById('seed').value) || null,
    };
    await apiPost('/api/sim/reset', cfg);
    state.config = {...state.config, ...cfg};
    state.events = [];
    state.agents = [];
    state.animations = [];
    state.pendingAnimations = [];
    renderRoster();
    renderLog();
    updateStatsPanels();
}

async function pauseOnChange() {
    if (state.running) {
        try { await apiPost('/api/sim/pause', {}); } catch(e){}
        state.running = false;
        updateControlUI();
    }
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
    const ti = state.config.tick_interval || 0.9;
    document.getElementById('num-comms').value = state.config.num_communicators;
    document.getElementById('num-atks').value = state.config.num_attackers;
    document.getElementById('atk-temp').value = state.config.attacker_temperature;
    document.getElementById('comm-temp').value = state.config.communicator_temperature;
    const rate = 1.0 / ti;
    document.getElementById('tick-rate').value = rate;
    document.getElementById('num-comms-val').textContent = state.config.num_communicators;
    document.getElementById('num-atks-val').textContent = state.config.num_attackers;
    document.getElementById('atk-temp-val').textContent = state.config.attacker_temperature.toFixed(2);
    document.getElementById('comm-temp-val').textContent = state.config.communicator_temperature.toFixed(2);
    document.getElementById('tick-rate-val').textContent = rate.toFixed(1) + '/s';
}

// ---------------------------------------------------------------------------
// Stats panels.
// ---------------------------------------------------------------------------

function updateStatsPanels() {
    if (!state.stats) return;
    const s = state.stats;

    document.getElementById('stat-tick').textContent = s.summary.tick;
    document.getElementById('stat-messages').textContent = s.summary.total_messages;
    document.getElementById('stat-survival').textContent = s.summary.overall_survival_pct.toFixed(0) + '%';
    document.getElementById('stat-ciphers').textContent = s.summary.distinct_ciphers_used;

    // Cipher usage — visual bars
    const cipherRows = (s.cipher_usage || [])
        .map(c => ({...c, usage_pct: s.summary.total_messages ? 100 * c.used / s.summary.total_messages : 0,
                     break_pct: c.used ? 100 * c.broken / c.used : 0}))
        .filter(c => c.used > 0)
        .sort((a, b) => b.used - a.used);

    const cipherEl = document.getElementById('cipher-usage-chart');
    if (cipherRows.length === 0) {
        cipherEl.innerHTML = '<div class="empty-state"><i class="fa-solid fa-inbox"></i><div>No data yet — start the simulation.</div></div>';
    } else {
        cipherEl.innerHTML = cipherRows.map(c => {
            const color = cipherColorFor(c.name);
            const breakColor = cssVar('--danger');
            return `
                <div class="usage-row tooltip">
                    <div class="name">${cipherName(c.name)}</div>
                    <div class="bar-track">
                        <div class="bar-fill" style="width:${c.usage_pct}%;background:${color}"></div>
                        <div class="bar-fill secondary" style="width:${c.break_pct}%;background:${breakColor}"></div>
                    </div>
                    <div class="pct">${c.usage_pct.toFixed(0)}%</div>
                    <span class="tooltip-text">
                        <div class="row"><span>Sent</span><b>${c.used}</b></div>
                        <div class="row"><span>Broken</span><b>${c.broken}</b></div>
                        <div class="row"><span>Break rate</span><b>${c.break_pct.toFixed(1)}%</b></div>
                        <div class="row"><span>Share of traffic</span><b>${c.usage_pct.toFixed(1)}%</b></div>
                    </span>
                </div>
            `;
        }).join('');
    }

    // Attack usage — visual bars
    const totalAtks = (s.attack_usage || []).reduce((sum, a) => sum + a.used, 0);
    const atkRows = (s.attack_usage || [])
        .map(a => ({...a, usage_pct: totalAtks ? 100 * a.used / totalAtks : 0,
                     succ_pct: a.used ? 100 * a.success / a.used : 0}))
        .filter(a => a.used > 0)
        .sort((a, b) => b.used - a.used);

    const atkEl = document.getElementById('attack-usage-chart');
    if (atkRows.length === 0) {
        atkEl.innerHTML = '<div class="empty-state"><i class="fa-solid fa-inbox"></i><div>No data yet — start the simulation.</div></div>';
    } else {
        atkEl.innerHTML = atkRows.map(a => {
            const color = attackColorFor(a.name);
            return `
                <div class="usage-row tooltip">
                    <div class="name">${attackName(a.name)}</div>
                    <div class="bar-track">
                        <div class="bar-fill" style="width:${a.succ_pct}%;background:${color}"></div>
                    </div>
                    <div class="pct">${a.usage_pct.toFixed(0)}%</div>
                    <span class="tooltip-text">
                        <div class="row"><span>Attempts</span><b>${a.used}</b></div>
                        <div class="row"><span>Successes</span><b>${a.success}</b></div>
                        <div class="row"><span>Success rate</span><b>${a.succ_pct.toFixed(1)}%</b></div>
                        <div class="row"><span>Share of attacks</span><b>${a.usage_pct.toFixed(1)}%</b></div>
                    </span>
                </div>
            `;
        }).join('');
    }
}

function cipherColorFor(slug) {
    return {shift:'#00838f', rail_fence:'#00838f', permutation:'#1565c0',
            vigenere:'#1565c0', substitution:'#6a1b9a', stream:'#6a1b9a',
            feistel:'#d84315', aes:'#d84315', rsa:'#2e7d32'}[slug] || '#888';
}
function attackColorFor(slug) {
    return {brute_force:'#c62828', frequency:'#c62828',
            known_plaintext:'#ef6c00', dictionary:'#ef6c00'}[slug] || '#888';
}

// ---------------------------------------------------------------------------
// Agent roster.
// ---------------------------------------------------------------------------

function renderRoster() {
    const comms = state.agents.filter(a => a.role === 'communicator');
    const atks = state.agents.filter(a => a.role === 'attacker');
    if (comms.length === 0 && atks.length === 0) {
        document.getElementById('agent-roster').innerHTML =
            '<div class="empty-state"><i class="fa-solid fa-users-slash"></i><div>Waiting for agents...</div></div>';
        return;
    }

    const commHtml = comms.map(a => {
        const sent = a.sent || 0, broken = a.broken || 0, ok = sent - broken;
        return `
            <div class="phone-list-item" onclick="openAgent('${a.name}','communicator')">
                <div class="avatar" style="background:${a.color}">${initials(a.name)}</div>
                <div class="info">
                    <div class="name">${a.name}</div>
                    <div class="preview" style="display:flex;gap:6px;align-items:center">
                        <span class="tag" style="padding:1px 6px;font-size:0.65rem"><i class="fa-solid fa-paper-plane"></i> ${sent}</span>
                        <span class="tag tag-success" style="padding:1px 6px;font-size:0.65rem"><i class="fa-solid fa-shield-halved"></i> ${ok}</span>
                        ${broken > 0 ? `<span class="tag tag-danger" style="padding:1px 6px;font-size:0.65rem"><i class="fa-solid fa-skull"></i> ${broken}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    const atkHtml = atks.map(a => {
        const attempts = a.attempts || 0, success = a.success || 0;
        return `
            <div class="phone-list-item" onclick="openAgent('${a.name}','attacker')">
                <div class="avatar" style="background:${a.color}">${initials(a.name)}</div>
                <div class="info">
                    <div class="name">${a.name}</div>
                    <div class="preview" style="display:flex;gap:6px;align-items:center">
                        <span class="tag" style="padding:1px 6px;font-size:0.65rem"><i class="fa-solid fa-crosshairs"></i> ${attempts}</span>
                        <span class="tag tag-danger" style="padding:1px 6px;font-size:0.65rem"><i class="fa-solid fa-skull"></i> ${success}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('agent-roster').innerHTML = `
        <div style="padding:8px 12px 4px;font-family:var(--font-mono);font-size:0.72rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em">
            <i class="fa-solid fa-comment-dots" style="color:var(--accent)"></i> Communicators
        </div>
        ${commHtml}
        <div style="height:8px"></div>
        <div style="padding:8px 12px 4px;font-family:var(--font-mono);font-size:0.72rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em">
            <i class="fa-solid fa-skull-crossbones" style="color:var(--danger)"></i> Hackers
        </div>
        ${atkHtml}
    `;
}

// ---------------------------------------------------------------------------
// Agent filter dropdown — dynamic.
// ---------------------------------------------------------------------------

function updateAgentFilter() {
    const sel = document.getElementById('filter-agent');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">any</option>' +
        state.agents.map(a => `<option value="${a.name}">${a.name}</option>`).join('');
    if (state.agents.some(a => a.name === current)) sel.value = current;
}

// ---------------------------------------------------------------------------
// Log panel.
// ---------------------------------------------------------------------------

function renderLog() {
    const container = document.getElementById('log-entries');
    if (!container) return;
    let events = state.events.slice().reverse();

    const f = state.filters;
    if (f.agent) events = events.filter(e =>
        e.sender === f.agent || e.target === f.agent || e.attacker === f.agent);
    if (f.cipher) events = events.filter(e => e.cipher === f.cipher);
    if (f.attack) events = events.filter(e => e.attack === f.attack);
    if (f.outcome === 'success') events = events.filter(e => e.kind === 'intercepted');
    if (f.outcome === 'failed') events = events.filter(e => e.kind === 'secure');
    if (f.outcome === 'send') events = events.filter(e => e.kind === 'send');

    events = events.slice(0, 80);

    const countEl = document.getElementById('log-count');
    if (countEl) countEl.textContent = events.length;

    if (events.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-inbox"></i><div>No events match the filters.</div></div>';
        return;
    }

    container.innerHTML = events.map((ev, idx) => {
        let cls = 'log-entry ' + ev.kind;
        let icon = 'fa-message';
        if (ev.kind === 'send') icon = 'fa-paper-plane';
        else if (ev.kind === 'intercepted') icon = 'fa-skull-crossbones';
        else if (ev.kind === 'secure') icon = 'fa-shield-halved';
        else if (ev.kind === 'skip') icon = 'fa-forward';

        // Stagger the CSS animation per entry.
        const delay = (idx * 50) + 'ms';

        return `
            <div class="${cls}" style="animation-delay:${delay}">
                <span class="tick">T${ev.tick}</span>
                <i class="fa-solid ${icon}" style="width:14px;color:var(--text-muted)"></i>
                ${ev.kind === 'send'
                    ? `<span><b>${ev.sender}</b> <i class="fa-solid fa-arrow-right" style="color:var(--text-dim);font-size:0.7rem"></i> <b>${ev.target}</b> ${ev.cipher ? cipherTag(ev.cipher) : ''} <span class="text-muted">"${escapeHtml(ev.message_preview)}"</span></span>`
                    : ev.kind === 'intercepted'
                    ? `<span><b>${ev.attacker}</b> cracked <b>${ev.sender}</b>'s ${ev.cipher ? cipherTag(ev.cipher) : ''} with ${ev.attack ? attackTag(ev.attack) : ''} <span class="text-muted">(${escapeHtml(ev.notes)})</span></span>`
                    : ev.kind === 'secure'
                    ? `<span><b>${ev.attacker}</b> failed on <b>${ev.sender}</b>'s ${ev.cipher ? cipherTag(ev.cipher) : ''} ${ev.attack ? attackTag(ev.attack) : ''} <span class="text-muted">(${escapeHtml(ev.notes)})</span></span>`
                    : `<span><b>${ev.attacker}</b> skipped <b>${ev.sender}</b>'s ${ev.cipher ? cipherTag(ev.cipher) : ''}</span>`}
            </div>
        `;
    }).join('');
}

function togglePanel(id) { document.getElementById(id).classList.toggle('collapsed'); }
function setFilter(key, val) { state.filters[key] = val; renderLog(); }

// ---------------------------------------------------------------------------
// Phone modal.
// ---------------------------------------------------------------------------

async function openAgent(name, role) {
    if (role === 'communicator') await openPhone(name);
    else await openAttackerPanel(name);
}

async function openPhone(name) {
    state.openModal = {type: 'phone', name, contact: null};
    await refreshPhone();
    document.getElementById('phone-modal').classList.add('open');
}

async function refreshPhone() {
    if (!state.openModal || state.openModal.type !== 'phone') return;
    const name = state.openModal.name;
    const data = await apiGet(`/api/sim/agent/${encodeURIComponent(name)}/chat`);
    const header = document.querySelector('#phone-modal .phone-header');
    const body = document.getElementById('phone-body');
    const avatarEl = document.getElementById('phone-avatar');
    const nameEl = document.getElementById('phone-name');
    const statusEl = document.getElementById('phone-status');

    if (state.openModal.contact) {
        const contact = state.openModal.contact;
        header.classList.add('show-back');
        const contactAgent = state.agents.find(a => a.name === contact);
        avatarEl.style.background = contactAgent ? contactAgent.color : '#888';
        avatarEl.textContent = initials(contact);
        nameEl.textContent = contact;
        statusEl.innerHTML = '<span class="dot"></span> online';

        const msgs = (data.contacts || {})[contact] || [];
        if (msgs.length === 0) {
            body.innerHTML = '<div class="empty-state"><i class="fa-solid fa-comment-slash"></i><div>No messages yet.</div></div>';
            return;
        }
        let lastTick = -10;
        body.innerHTML = msgs.map(m => {
            const tickDivider = (m.tick - lastTick > 5) ? `<div class="chat-day-divider">— Tick ${m.tick} —</div>` : '';
            lastTick = m.tick;
            const cls = m.direction === 'out' ? 'out' : 'in';
            const banner = m.broken
                ? `<div class="intercepted-banner"><i class="fa-solid fa-skull-crossbones"></i> CRACKED by ${m.intercepted_by} via ${attackName(m.attack || '')}</div>`
                : (m.intercepted_by && !m.broken)
                ? `<div class="intercepted-banner survived"><i class="fa-solid fa-shield-halved"></i> ${m.intercepted_by} attacked — survived</div>`
                : '';
            return `
                ${tickDivider}
                <div class="chat-bubble ${cls} ${m.broken ? 'intercepted' : ''}">
                    ${banner}
                    <div class="cipher-tag">${cipherName(m.cipher)}</div>
                    <div>${escapeHtml(m.plaintext)}</div>
                    <div class="ciphertext">${m.ciphertext}</div>
                    <div class="tick">T${m.tick} <i class="fa-solid fa-lock" style="font-size:0.6rem"></i> L${m.security_level}</div>
                </div>
            `;
        }).join('');
        body.scrollTop = body.scrollHeight;
    } else {
        header.classList.remove('show-back');
        const agent = state.agents.find(a => a.name === name);
        avatarEl.style.background = agent ? agent.color : '#888';
        avatarEl.textContent = initials(name);
        nameEl.textContent = name;
        statusEl.innerHTML = '<span class="dot"></span> online';

        const contacts = Object.keys(data.contacts || {});
        if (contacts.length === 0) {
            body.innerHTML = '<div class="empty-state"><i class="fa-solid fa-comments"></i><div>No messages yet.</div></div>';
            return;
        }
        body.innerHTML = contacts.map(c => {
            const msgs = data.contacts[c];
            const last = msgs[msgs.length - 1];
            const preview = last.plaintext.slice(0, 32);
            // FIX: only show exclamation if the LATEST message was intercepted.
            const lastIntercepted = last && last.broken;
            const contactAgent = state.agents.find(a => a.name === c);
            const contactColor = contactAgent ? contactAgent.color : '#888';
            return `
                <div class="phone-list-item" onclick="openChat('${name}','${c}')">
                    <div class="avatar" style="background:${contactColor}">${initials(c)}</div>
                    <div class="info">
                        <div class="name">${c} ${lastIntercepted ? '<i class="fa-solid fa-triangle-exclamation" style="color:var(--danger);font-size:0.7rem"></i>' : ''}</div>
                        <div class="preview">${escapeHtml(preview)}</div>
                    </div>
                    <div class="meta">T${last.tick}</div>
                </div>
            `;
        }).join('');
    }
}

function openChat(agentName, contactName) {
    state.openModal = {type: 'phone', name: agentName, contact: contactName};
    refreshPhone();
}

// ---------------------------------------------------------------------------
// Attacker panel.
// ---------------------------------------------------------------------------

async function openAttackerPanel(name) {
    state.openModal = {type: 'attacker', name};
    await refreshAttackerPanel();
    document.getElementById('attacker-modal').classList.add('open');
}

async function refreshAttackerPanel() {
    if (!state.openModal || state.openModal.type !== 'attacker') return;
    const name = state.openModal.name;
    const data = await apiGet(`/api/sim/agent/${encodeURIComponent(name)}/attacks`);
    const body = document.getElementById('attacker-body');
    document.getElementById('attacker-title').textContent = `${name} — attack log`;

    const attempts = data.attempts || [];
    if (attempts.length === 0) {
        body.innerHTML = '<div class="empty-state"><i class="fa-solid fa-satellite-dish"></i><div>No attacks yet.</div></div>';
        return;
    }
    body.innerHTML = attempts.slice().reverse().map(a => {
        const color = a.success ? 'var(--danger)' : a.skipped ? 'var(--text-dim)' : 'var(--success)';
        const badge = a.success
            ? '<span class="tag tag-danger"><i class="fa-solid fa-skull-crossbones"></i> Cracked</span>'
            : a.skipped
            ? '<span class="tag"><i class="fa-solid fa-forward"></i> Skipped</span>'
            : '<span class="tag tag-success"><i class="fa-solid fa-shield-halved"></i> Survived</span>';
        return `
            <div class="panel mb-2" style="padding:14px;border-left:4px solid ${color}">
                <div class="flex items-center justify-between mb-1" style="flex-wrap:wrap;gap:8px">
                    <div style="font-family:var(--font-mono);font-size:0.82rem">
                        T${a.tick} · <b>${a.sender}</b>
                        <i class="fa-solid fa-arrow-right" style="color:var(--text-dim);font-size:0.7rem;margin:0 4px"></i>
                        <b>${a.target}</b>
                    </div>
                    <div>${badge} ${a.cipher ? cipherTag(a.cipher) : ''} ${a.attack ? attackTag(a.attack) : ''}</div>
                </div>
                ${a.ciphertext ? `<div class="output-block" style="margin:8px 0;font-size:0.78rem;padding:8px 10px">${escapeHtml(a.ciphertext)}</div>` : ''}
                ${a.plaintext ? `<div class="text-muted" style="font-size:0.85rem"><b>Recovered:</b> ${escapeHtml(a.plaintext)}</div>` : ''}
                <div class="text-muted" style="font-size:0.75rem;margin-top:4px;font-family:var(--font-mono)">${escapeHtml(a.notes)}</div>
            </div>
        `;
    }).join('');
}

function refreshOpenModal() {
    if (!state.openModal) return;
    if (state.openModal.type === 'phone') refreshPhone();
    else if (state.openModal.type === 'attacker') refreshAttackerPanel();
}

function closePhone() {
    if (state.openModal && state.openModal.contact) {
        state.openModal.contact = null;
        refreshPhone();
    } else {
        document.getElementById('phone-modal').classList.remove('open');
        state.openModal = null;
    }
}

function closeAttacker() {
    document.getElementById('attacker-modal').classList.remove('open');
    state.openModal = null;
}

// ---------------------------------------------------------------------------
// Wire up controls.
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    resizeCanvas();
    requestAnimationFrame(render);
    connect();

    document.getElementById('btn-start').onclick = simStart;
    document.getElementById('btn-pause').onclick = simPause;
    document.getElementById('btn-reset').onclick = simReset;

    ['num-comms', 'num-atks', 'seed'].forEach(id => {
        document.getElementById(id).addEventListener('change', pauseOnChange);
        document.getElementById(id).addEventListener('input', e => {
            if (id === 'num-comms') document.getElementById('num-comms-val').textContent = e.target.value;
            if (id === 'num-atks') document.getElementById('num-atks-val').textContent = e.target.value;
        });
    });

    document.getElementById('atk-temp').addEventListener('input', e => {
        document.getElementById('atk-temp-val').textContent = parseFloat(e.target.value).toFixed(2);
    });
    document.getElementById('atk-temp').addEventListener('change', async e => {
        await pauseOnChange();
        await apiPost('/api/sim/tune', {attacker_temperature: parseFloat(e.target.value)});
    });
    document.getElementById('comm-temp').addEventListener('input', e => {
        document.getElementById('comm-temp-val').textContent = parseFloat(e.target.value).toFixed(2);
    });
    document.getElementById('comm-temp').addEventListener('change', async e => {
        await pauseOnChange();
        await apiPost('/api/sim/tune', {communicator_temperature: parseFloat(e.target.value)});
    });
    document.getElementById('tick-rate').addEventListener('input', e => {
        document.getElementById('tick-rate-val').textContent = parseFloat(e.target.value).toFixed(1) + '/s';
    });
    document.getElementById('tick-rate').addEventListener('change', async e => {
        await pauseOnChange();
        const interval = 1.0 / parseFloat(e.target.value);
        await apiPost('/api/sim/tune', {tick_interval: interval});
    });

    document.getElementById('filter-agent').onchange = e => setFilter('agent', e.target.value);
    document.getElementById('filter-cipher').onchange = e => setFilter('cipher', e.target.value);
    document.getElementById('filter-attack').onchange = e => setFilter('attack', e.target.value);
    document.getElementById('filter-outcome').onchange = e => setFilter('outcome', e.target.value);

    document.getElementById('phone-back').onclick = closePhone;
    document.getElementById('attacker-close').onclick = closeAttacker;
    document.querySelectorAll('.modal-overlay').forEach(o => {
        o.addEventListener('click', e => {
            if (e.target === o) {
                o.classList.remove('open');
                state.openModal = null;
            }
        });
    });
});
