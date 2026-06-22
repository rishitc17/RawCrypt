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
    // Log scroll tracking: if the user scrolls up in the log, we stop
    // re-rendering until they scroll back to the bottom.
    logUserScrolled: false,
    pendingLogRender: false,
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
    const w = Math.max(100, rect.width);
    const h = Math.max(100, rect.height);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Re-layout agents with the NEW dimensions (don't rely on
    // canvas.offsetWidth which may not have updated yet).
    layoutAgents(w, h);
}

// Debounce resize: wait for the browser to settle (DevTools toggles
// fire many rapid resize events). Use rAF to ensure layout has
// completed before we re-measure.
let resizeRaf = null;
window.addEventListener('resize', () => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
        resizeRaf = null;
        // Double-rAF: first rAF measures, second rAF ensures the
        // browser has applied the new layout.
        requestAnimationFrame(resizeCanvas);
    });
});

// ---------------------------------------------------------------------------
// Agent layout.
// ---------------------------------------------------------------------------

function layoutAgents(explicitW, explicitH) {
    const w = explicitW || canvas.offsetWidth || 600;
    const h = explicitH || canvas.offsetHeight || 600;
    const cx = w / 2, cy = h / 2;
    const comms = state.agents.filter(a => a.role === 'communicator');
    const atks = state.agents.filter(a => a.role === 'attacker');
    const totalAgents = comms.length + atks.length;

    // Scale the radius and agent size based on the number of agents.
    // With few agents, use large circles on a big radius. With many
    // agents (75+25=100), shrink everything to fit.
    const baseR = Math.min(w, h) * 0.42;
    const innerBaseR = Math.min(w, h) * 0.14;
    // Shrink the outer ring as agent count grows.
    const scale = totalAgents > 20 ? Math.max(0.5, 1 - (totalAgents - 20) * 0.01) : 1;
    const outerR = baseR * scale;
    const innerR = innerBaseR * Math.max(0.7, scale);

    comms.forEach((a, i) => {
        const angle = (i / Math.max(comms.length, 1)) * Math.PI * 2 - Math.PI / 2;
        // Add small deterministic scatter based on index so positions
        // aren't perfectly uniform — but keep it stable across ticks.
        const scatter = ((i * 37) % 100) / 100 * 0.15 - 0.075;  // ±7.5% of radius
        const r = outerR * (1 + scatter);
        a.x = cx + Math.cos(angle) * r;
        a.y = cy + Math.sin(angle) * r;
    });

    atks.forEach((a, i) => {
        const angle = (i / Math.max(atks.length, 1)) * Math.PI * 2 - Math.PI / 2;
        const scatter = ((i * 53) % 100) / 100 * 0.2 - 0.1;
        const r = innerR * (1 + scatter);
        a.x = cx + Math.cos(angle) * r;
        a.y = cy + Math.sin(angle) * r;
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

// Dynamic agent radius — shrinks as more agents are added.
function getAgentRadius() {
    const n = state.agents.length;
    if (n <= 10) return 26;
    if (n <= 20) return 20;
    if (n <= 40) return 14;
    if (n <= 70) return 10;
    return 7;
}

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
        const agentR = getAgentRadius();
        state.animations = state.animations.filter(anim => {
            const elapsed = now - anim.startTime;
            if (elapsed < 0) return true;   // not started yet
            if (elapsed > anim.duration) return false;
            try { drawAnimation(anim, elapsed, agentR); } catch (e) { /* skip broken anim */ }
            return true;
        });

        // Draw agents on top.
        state.agents.forEach(a => { try { drawAgent(a, now, agentR); } catch (e) {} });
    } catch (e) {
        // Never let the render loop die.
    }
    requestAnimationFrame(render);
}

function drawAgent(a, now, radius) {
    const r = radius || 26;
    const pulse = state.animations.some(anim =>
        (anim.fromName === a.name || anim.toName === a.name) &&
        (now - anim.startTime) < 500 && (now - anim.startTime) > 0
    );

    ctx.beginPath();
    ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
    ctx.fillStyle = a.color;
    ctx.fill();
    ctx.lineWidth = pulse ? 4 : 3;
    ctx.strokeStyle = pulse ? cssVar('--accent') : cssVar('--bg-panel');
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.max(8, r * 0.55)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(a.name), a.x, a.y);

    // Only draw name labels if the circles are big enough.
    if (r >= 14) {
        ctx.fillStyle = cssVar('--text');
        ctx.font = `600 ${Math.max(8, r * 0.42)}px "IBM Plex Mono", monospace`;
        ctx.fillText(a.name, a.x, a.y + r + 14);
    }

    // Only draw role labels if circles are big enough.
    if (r >= 18) {
        ctx.font = `${Math.max(7, r * 0.32)}px "IBM Plex Mono", monospace`;
        ctx.fillStyle = a.role === 'attacker' ? cssVar('--danger') : cssVar('--text-muted');
        ctx.fillText(a.role === 'attacker' ? '▲ HACKER' : '◆ COMM', a.x, a.y - r - 8);
    }
}

function drawAnimation(anim, elapsed, agentR) {
    const r = agentR || 26;
    const progress = Math.min(1, Math.max(0, elapsed / anim.duration));
    if (progress <= 0) return;

    if (anim.kind === 'send') {
        const from = anim.from, to = anim.to;
        const dx = to.x - from.x, dy = to.y - from.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 1) return;
        const ux = dx / dist, uy = dy / dist;
        const sx = from.x + ux * (r + 4);
        const sy = from.y + uy * (r + 4);
        const ex = to.x - ux * (r + 8);
        const ey = to.y - uy * (r + 8);

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
        // ws-status element was removed from the page; nothing to update.
    };
    state.ws.onclose = () => {
        setTimeout(connect, 1500);
    };
    state.ws.onerror = () => { try { state.ws.close(); } catch(e){} };
    state.ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.type === 'snapshot') processSnapshot(data);
        else if (data.type === 'tick') processTick(data);
    };
}

// Pause when the user navigates to a different RawCrypt page.
// We intercept clicks on internal links and the popstate event (back/forward).
// We do NOT pause on tab/window switch (visibilitychange) — only on actual
// in-site navigation.
function setupNavigationPause() {
    // Intercept internal link clicks.
    document.addEventListener('click', async (e) => {
        const link = e.target.closest('a');
        if (!link) return;
        const href = link.getAttribute('href');
        if (!href || href.startsWith('http') || href.startsWith('#') ||
            href.startsWith('mailto:') || href.startsWith('tel:')) return;
        // Internal navigation — pause the sim before leaving.
        if (state.running) {
            try { await apiPost('/api/sim/pause', {}); } catch(e){}
            state.running = false;
        }
    });
    // Back/forward navigation.
    window.addEventListener('popstate', async () => {
        if (state.running) {
            try { await apiPost('/api/sim/pause', {}); } catch(e){}
            state.running = false;
        }
    });
}

// ---------------------------------------------------------------------------
// Sim control.
// ---------------------------------------------------------------------------

async function simStart() {
    // If the sim hasn't started yet (tick == 0) and the sliders have
    // been changed, apply them first via a reset, then start.
    if (state.stats && state.stats.tick === 0) {
        const cfg = readConfigFromControls();
        // Only reset if any setting differs from the current config.
        const currentCfg = {
            num_communicators: state.config.num_communicators,
            num_attackers: state.config.num_attackers,
            attacker_temperature: state.config.attacker_temperature,
            communicator_temperature: state.config.communicator_temperature,
            tick_interval: 0.1,
            seed: state.config.seed || null,
        };
        if (JSON.stringify(cfg) !== JSON.stringify(currentCfg)) {
            await apiPost('/api/sim/reset', cfg);
            state.config = {...state.config, ...cfg};
        }
    }
    await apiPost('/api/sim/start', {});
    state.running = true;
    updateControlUI();
}

async function simPause() {
    await apiPost('/api/sim/pause', {});
    state.running = false;
    updateControlUI();
}

function readConfigFromControls() {
    return {
        num_communicators: parseInt(document.getElementById('num-comms').value),
        num_attackers: parseInt(document.getElementById('num-atks').value),
        attacker_temperature: parseFloat(document.getElementById('atk-temp').value),
        communicator_temperature: parseFloat(document.getElementById('comm-temp').value),
        tick_interval: 0.1,  // backend runs as fast as possible
        seed: parseInt(document.getElementById('seed').value) || null,
    };
}

async function simReset() {
    const cfg = readConfigFromControls();
    await apiPost('/api/sim/reset', cfg);
    state.config = {...state.config, ...cfg};
    state.events = [];
    state.animations = [];
    state.pendingAnimations = [];
    renderRoster();
    renderLog();
    updateStatsPanels();
    updateControlUI();
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
    document.getElementById('num-comms').value = state.config.num_communicators;
    document.getElementById('num-atks').value = state.config.num_attackers;
    document.getElementById('atk-temp').value = state.config.attacker_temperature;
    document.getElementById('comm-temp').value = state.config.communicator_temperature;
    document.getElementById('num-comms-val').textContent = state.config.num_communicators;
    document.getElementById('num-atks-val').textContent = state.config.num_attackers;
    document.getElementById('atk-temp-val').textContent = state.config.attacker_temperature.toFixed(2);
    document.getElementById('comm-temp-val').textContent = state.config.communicator_temperature.toFixed(2);

    // Lock all reset-required sliders when tick > 0.
    const lockResetSliders = (state.stats && state.stats.tick > 0);
    ['num-comms', 'num-atks', 'seed', 'atk-temp', 'comm-temp'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = lockResetSliders;
            el.style.opacity = lockResetSliders ? '0.5' : '1';
            el.style.cursor = lockResetSliders ? 'not-allowed' : '';
        }
    });
}

// ---------------------------------------------------------------------------
// Preview agents when sliders change at tick 0.
// ---------------------------------------------------------------------------

async function previewAgents() {
    // Only preview when paused and tick == 0 — otherwise the real sim
    // state is the source of truth.
    if (state.running) return;
    if (state.stats && state.stats.tick > 0) return;

    const numComms = parseInt(document.getElementById('num-comms').value);
    const numAtks = parseInt(document.getElementById('num-atks').value);

    // Optimistically rebuild the agent list so the canvas updates immediately.
    // We don't have real names yet (the server picks them on reset), so we
    // just clear the canvas and show a placeholder.
    const previewAgents = [];
    for (let i = 0; i < numComms; i++) {
        previewAgents.push({
            name: `Comm ${i+1}`, role: 'communicator', idx: i,
            x: 0, y: 0, color: commColor(i),
            sent: 0, broken: 0, topActions: [],
        });
    }
    for (let i = 0; i < numAtks; i++) {
        previewAgents.push({
            name: `Hacker ${i+1}`, role: 'attacker', idx: i,
            x: 0, y: 0, color: atkColor(i),
            attempts: 0, success: 0, topActions: [],
        });
    }
    // Only replace if counts actually changed (don't wipe real agents).
    if (previewAgents.length !== state.agents.length ||
        previewAgents.filter(a => a.role === 'communicator').length !==
        state.agents.filter(a => a.role === 'communicator').length) {
        state.agents = previewAgents;
        resetColorCache();
        state.agents.forEach(a => { colorForAgent(a.name, a.role, a.idx); });
        layoutAgents();
        // Render a placeholder roster.
        renderRoster();
    }
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

    // Cipher usage — single bar showing % of traffic, with red broken overlay
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
            // Striped overlay using a darkened Universal Red so the cipher's
            // own colour shows through the transparent gaps.
            const brokenStripe = stripePattern(darken(BROKEN_RED, 0.15));
            const brokenSegmentPct = c.usage_pct * (c.break_pct / 100);
            return `
                <div class="usage-row tooltip">
                    <div class="name">${cipherName(c.name)}</div>
                    <div class="bars">
                        <div class="bar-track" style="position:relative">
                            <div class="bar-fill" style="width:${c.usage_pct}%;background:${color};position:absolute;left:0;top:0"></div>
                            <div class="bar-fill" style="width:${brokenSegmentPct}%;background:${brokenStripe};position:absolute;left:0;top:0"></div>
                        </div>
                    </div>
                    <span class="tooltip-text">
                        <div class="row"><span>Share of traffic</span><b>${c.usage_pct.toFixed(1)}%</b></div>
                        <div class="row"><span>Sent</span><b>${c.used}</b></div>
                        <div class="row"><span>Broken</span><b>${c.broken}</b></div>
                        <div class="row"><span>Break rate</span><b>${c.break_pct.toFixed(1)}%</b></div>
                    </span>
                </div>
            `;
        }).join('');
    }

    // Attack usage — single bar showing % of traffic with green failure overlay
    const totalAtks = (s.attack_usage || []).reduce((sum, a) => sum + a.used, 0);
    const atkRows = (s.attack_usage || [])
        .map(a => ({...a, usage_pct: totalAtks ? 100 * a.used / totalAtks : 0,
                     succ_pct: a.used ? 100 * a.success / a.used : 0,
                     fail_pct: a.used ? 100 * (a.used - a.success) / a.used : 0}))
        .filter(a => a.used > 0)
        .sort((a, b) => b.used - a.used);

    const atkEl = document.getElementById('attack-usage-chart');
    if (atkRows.length === 0) {
        atkEl.innerHTML = '<div class="empty-state"><i class="fa-solid fa-inbox"></i><div>No data yet — start the simulation.</div></div>';
    } else {
        atkEl.innerHTML = atkRows.map(a => {
            const color = attackColorFor(a.name);
            // Striped overlay using a darkened version of the attack's OWN
            // colour, so each attack has a distinct failure stripe that
            // contrasts with its base colour.
            const failStripe = stripePattern(darken(color, 0.45));
            const failedSegmentPct = a.usage_pct * (a.fail_pct / 100);
            return `
                <div class="usage-row tooltip">
                    <div class="name">${attackName(a.name)}</div>
                    <div class="bars">
                        <div class="bar-track" style="position:relative">
                            <div class="bar-fill" style="width:${a.usage_pct}%;background:${color};position:absolute;left:0;top:0"></div>
                            <div class="bar-fill" style="width:${failedSegmentPct}%;background:${failStripe};position:absolute;left:0;top:0"></div>
                        </div>
                    </div>
                    <span class="tooltip-text">
                        <div class="row"><span>Share of attacks</span><b>${a.usage_pct.toFixed(1)}%</b></div>
                        <div class="row"><span>Attempts</span><b>${a.used}</b></div>
                        <div class="row"><span>Failures</span><b>${a.used - a.success}</b></div>
                        <div class="row"><span>Failure rate</span><b>${a.fail_pct.toFixed(1)}%</b></div>
                    </span>
                </div>
            `;
        }).join('');
    }
}

function cipherColorFor(slug) {
    return {
        shift:        '#10B981',  // emerald
        rail_fence:   '#65A30D',  // lime
        permutation:  '#4F46E5',  // indigo
        vigenere:     '#EC4899',  // pink
        substitution: '#EA580C',  // orange
        stream:       '#06B6D4',  // cyan
        feistel:      '#F59E0B',  // amber
        aes:          '#2563EB',  // blue
        rsa:          '#9333EA',  // purple
    }[slug] || '#888';
}
function attackColorFor(slug) {
    return {
        brute_force:      '#DC2626',  // red
        frequency:        '#0D9488',  // teal
        known_plaintext:  '#CA8A04',  // yellow
        dictionary:       '#F43F5E',  // rose
    }[slug] || '#888';
}
// Universal Red for the "broken" overlay on cipher usage bars.
const BROKEN_RED = '#EF4444';

/**
 * Darken a hex colour by mixing it with black at the given ratio.
 * Used to produce a stripe colour that reads clearly against the base.
 */
function darken(hex, ratio) {
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    const nr = Math.round(r * (1 - ratio));
    const ng = Math.round(g * (1 - ratio));
    const nb = Math.round(b * (1 - ratio));
    return '#' + [nr, ng, nb].map(v => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Build a diagonal stripe pattern for an overlay.
 * `stripeColor` is the stripe, the gaps are transparent so the base
 * bar colour shows through.
 */
function stripePattern(stripeColor) {
    return `repeating-linear-gradient(45deg, ${stripeColor}, ${stripeColor} 4px, transparent 4px, transparent 8px)`;
}

// ---------------------------------------------------------------------------
// Agent roster — two tabs (Communicators / Hackers).
// ---------------------------------------------------------------------------

let rosterTab = 'communicators';

function setRosterTab(tab) {
    rosterTab = tab;
    renderRoster();
}

function renderRoster() {
    const comms = state.agents.filter(a => a.role === 'communicator');
    const atks = state.agents.filter(a => a.role === 'attacker');
    const container = document.getElementById('agent-roster');
    if (comms.length === 0 && atks.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-users-slash"></i><div>Waiting for agents...</div></div>';
        return;
    }

    const commHtml = comms.map(a => {
        const sent = a.sent || 0, broken = a.broken || 0;
        // Clamp: ok can't be negative (broken can momentarily exceed sent
        // due to a race between the send and attack event updates).
        const ok = Math.max(0, sent - broken);
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
    }).join('') || '<div class="empty-state" style="padding:20px"><div>No communicators.</div></div>';

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
    }).join('') || '<div class="empty-state" style="padding:20px"><div>No hackers.</div></div>';

    container.innerHTML = `
        <div class="roster-tabs">
            <button class="roster-tab ${rosterTab === 'communicators' ? 'active' : ''}" onclick="setRosterTab('communicators')">
                <i class="fa-solid fa-comment-dots"></i> Communicators (${comms.length})
            </button>
            <button class="roster-tab ${rosterTab === 'hackers' ? 'active' : ''}" onclick="setRosterTab('hackers')">
                <i class="fa-solid fa-skull-crossbones"></i> Hackers (${atks.length})
            </button>
        </div>
        <div class="roster-tab-content">
            ${rosterTab === 'communicators' ? commHtml : atkHtml}
        </div>
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

function truncate(s, n) {
    if (!s) return '';
    return s.length > n ? s.slice(0, n) + '\u2026' : s;
}

function renderLog() {
    const container = document.getElementById('log-entries');
    if (!container) return;

    // Check if the user is scrolled to (or near) the bottom. If not,
    // don't re-render — it would jolt their scroll position and cause
    // the blank-flash issue. We'll re-render on the next tick where
    // they ARE at the bottom, or when they manually change a filter.
    const isNearBottom = (container.scrollTop + container.clientHeight) >= (container.scrollHeight - 50);
    if (state.logUserScrolled && !isNearBottom) {
        // Skip this render; the user is reading older entries.
        state.pendingLogRender = true;
        // Still update the count badge.
        let count = state.events.length;
        const f = state.filters;
        if (f.agent || f.cipher || f.attack || f.outcome !== 'all') {
            count = state.events.filter(e => {
                if (f.agent) {
                    if (e.kind === 'send') { if (!(e.sender === f.agent || e.target === f.agent)) return false; }
                    else if (e.kind === 'intercepted' || e.kind === 'secure') { if (e.sender !== f.agent) return false; }
                    else if (e.kind === 'skip') { if (e.attacker !== f.agent) return false; }
                }
                if (f.cipher && e.cipher !== f.cipher) return false;
                if (f.attack && e.attack !== f.attack) return false;
                if (f.outcome === 'success' && e.kind !== 'intercepted') return false;
                if (f.outcome === 'failed' && e.kind !== 'secure') return false;
                if (f.outcome === 'send' && e.kind !== 'send') return false;
                return true;
            }).length;
        }
        const countEl = document.getElementById('log-count');
        if (countEl) countEl.textContent = count;
        return;
    }
    state.logUserScrolled = false;
    state.pendingLogRender = false;

    let events = state.events.slice().reverse();

    const f = state.filters;
    if (f.agent) {
        // FIX: for survival (secure) and intercepted events, the agent filter
        // should match the SENDER only (not the recipient/attacker). For send
        // events, match sender or target. For skip, match attacker.
        events = events.filter(e => {
            if (e.kind === 'send') return e.sender === f.agent || e.target === f.agent;
            if (e.kind === 'intercepted' || e.kind === 'secure') return e.sender === f.agent;
            if (e.kind === 'skip') return e.attacker === f.agent;
            return false;
        });
    }
    if (f.cipher) events = events.filter(e => e.cipher === f.cipher);
    if (f.attack) events = events.filter(e => e.attack === f.attack);
    if (f.outcome === 'success') events = events.filter(e => e.kind === 'intercepted');
    if (f.outcome === 'failed') events = events.filter(e => e.kind === 'secure');
    if (f.outcome === 'send') events = events.filter(e => e.kind === 'send');

    // FIX: count total matching events BEFORE slicing (so the counter
    // doesn't cap at 80).
    const totalCount = events.length;
    events = events.slice(0, 80);

    // FIX: update the log count badge with the total matching count.
    const countEl = document.getElementById('log-count');
    if (countEl) countEl.textContent = totalCount;

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

        // FIX: truncate to 37 chars so a 40-char backend preview gets "…" appended.
        const preview = truncate(ev.message_preview, 37);
        // FIX: truncate the notes too.
        const notes = truncate(ev.notes, 50);

        // Stagger the CSS animation per entry.
        const delay = (idx * 60) + 'ms';

        return `
            <div class="${cls}" style="animation-delay:${delay}">
                <span class="tick">T${ev.tick}</span>
                <i class="fa-solid ${icon}" style="width:14px;color:var(--text-muted)"></i>
                ${ev.kind === 'send'
                    ? `<span><b>${ev.sender}</b> <i class="fa-solid fa-arrow-right" style="color:var(--text-dim);font-size:0.7rem"></i> <b>${ev.target}</b> ${ev.cipher ? cipherTag(ev.cipher) : ''} <span class="text-muted">"${escapeHtml(preview)}"</span></span>`
                    : ev.kind === 'intercepted'
                    ? `<span><b>${ev.attacker}</b> cracked <b>${ev.sender}</b>'s ${ev.cipher ? cipherTag(ev.cipher) : ''} with ${ev.attack ? attackTag(ev.attack) : ''} <span class="text-muted">(${escapeHtml(notes)})</span></span>`
                    : ev.kind === 'secure'
                    ? `<span><b>${ev.attacker}</b>'s ${ev.attack ? attackTag(ev.attack) : ''} failed on <b>${ev.sender}</b>'s ${ev.cipher ? cipherTag(ev.cipher) : ''} <span class="text-muted">(${escapeHtml(notes)})</span></span>`
                    : `<span><b>${ev.attacker}</b> skipped <b>${ev.sender}</b>'s ${ev.cipher ? cipherTag(ev.cipher) : ''}</span>`}
            </div>
        `;
    }).join('');
}

function togglePanel(id) { document.getElementById(id).classList.toggle('collapsed'); }
function setFilter(key, val) {
    state.filters[key] = val;
    // Force render when user manually changes a filter.
    state.logUserScrolled = false;
    state.pendingLogRender = false;
    renderLog();
}

function clearFilters() {
    state.filters = { agent: '', cipher: '', attack: '', outcome: 'all' };
    document.getElementById('filter-agent').value = '';
    document.getElementById('filter-cipher').value = '';
    document.getElementById('filter-attack').value = '';
    document.getElementById('filter-outcome').value = 'all';
    // Force render.
    state.logUserScrolled = false;
    state.pendingLogRender = false;
    renderLog();
}

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
    setupNavigationPause();

    document.getElementById('btn-start').onclick = simStart;
    document.getElementById('btn-pause').onclick = simPause;
    document.getElementById('btn-reset').onclick = simReset;

    // Reset-required sliders: lock at tick > 0, preview agents at tick 0.
    ['num-comms', 'num-atks'].forEach(id => {
        document.getElementById(id).addEventListener('input', e => {
            if (id === 'num-comms') document.getElementById('num-comms-val').textContent = e.target.value;
            if (id === 'num-atks') document.getElementById('num-atks-val').textContent = e.target.value;
            previewAgents();
        });
    });

    // Greediness + Caution: live-preview the value, apply on change (which pauses).
    document.getElementById('atk-temp').addEventListener('input', e => {
        document.getElementById('atk-temp-val').textContent = parseFloat(e.target.value).toFixed(2);
    });
    document.getElementById('atk-temp').addEventListener('change', async e => {
        await pauseOnChange();
        await apiPost('/api/sim/tune', {attacker_temperature: parseFloat(e.target.value)});
        state.config.attacker_temperature = parseFloat(e.target.value);
    });
    document.getElementById('comm-temp').addEventListener('input', e => {
        document.getElementById('comm-temp-val').textContent = parseFloat(e.target.value).toFixed(2);
    });
    document.getElementById('comm-temp').addEventListener('change', async e => {
        await pauseOnChange();
        await apiPost('/api/sim/tune', {communicator_temperature: parseFloat(e.target.value)});
        state.config.communicator_temperature = parseFloat(e.target.value);
    });

    document.getElementById('filter-agent').onchange = e => setFilter('agent', e.target.value);
    document.getElementById('filter-cipher').onchange = e => setFilter('cipher', e.target.value);
    document.getElementById('filter-attack').onchange = e => setFilter('attack', e.target.value);
    document.getElementById('filter-outcome').onchange = e => setFilter('outcome', e.target.value);

    // Track when the user scrolls up in the log panel — if they do,
    // stop re-rendering on new ticks until they scroll back to bottom.
    const logEntries = document.getElementById('log-entries');
    if (logEntries) {
        logEntries.addEventListener('scroll', () => {
            const isNearBottom = (logEntries.scrollTop + logEntries.clientHeight) >= (logEntries.scrollHeight - 50);
            if (!isNearBottom) {
                state.logUserScrolled = true;
            } else if (state.pendingLogRender) {
                state.logUserScrolled = false;
                renderLog();
            }
        });
    }

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
