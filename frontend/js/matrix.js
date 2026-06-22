// Matrix-rain effect for the hero on the home page.
// Renders falling katakana + binary digits in the accent colour.

function startMatrixRain(canvas) {
    const ctx = canvas.getContext('2d');

    function resize() {
        canvas.width = canvas.offsetWidth * window.devicePixelRatio;
        canvas.height = canvas.offsetHeight * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
    resize();
    window.addEventListener('resize', () => {
        // Reset transform then re-scale.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        resize();
    });

    const chars = 'アカサタナハマヤラワガザダバパイキシチニヒミリギジヂビピウクスツヌフムユルグズヅブプエケセテネヘメレゲゼデベペオコソトノホモヨロゴゾドボポ01'.split('');
    const fontSize = 14;
    let columns = Math.floor(canvas.offsetWidth / fontSize);
    let drops = new Array(columns).fill(0).map(() => Math.random() * -100);
    // FIX: timestamp-based advancement — speed is independent of frame rate.
    // Denser (smaller font → more columns) and slightly faster (90ms interval).
    const ADVANCE_INTERVAL_MS = 90;
    const DROP_SPEED = 0.5;
    let lastAdvanceTime = 0;

    function recomputeColumns() {
        columns = Math.floor(canvas.offsetWidth / fontSize);
        const newDrops = new Array(columns).fill(0).map(() => Math.random() * -100);
        // Preserve existing drop positions where possible.
        for (let i = 0; i < Math.min(drops.length, newDrops.length); i++) {
            newDrops[i] = drops[i];
        }
        drops = newDrops;
    }
    window.addEventListener('resize', recomputeColumns);

    let running = true;
    // Pause animation when tab is not visible to save CPU.
    document.addEventListener('visibilitychange', () => {
        running = !document.hidden;
        if (running) requestAnimationFrame(draw);
    });

    function draw() {
        if (!running) return;

        // Translucent fill for the trailing fade effect.
        const isDark = currentThemeIsDark();
        ctx.fillStyle = isDark ? 'rgba(15, 14, 12, 0.03)' : 'rgba(250, 246, 239, 0.03)';
        ctx.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

        const accent = cssVar('--accent') || (isDark ? '#a3e635' : '#e8702a');
        ctx.font = `${fontSize}px 'IBM Plex Mono', monospace`;

        // FIX: advance drops based on wall-clock time, not frame count.
        // This prevents speed changes when the frame rate varies (e.g.
        // when switching tabs or on high-refresh monitors).
        const now = performance.now();
        const shouldAdvance = (now - lastAdvanceTime) >= ADVANCE_INTERVAL_MS;
        if (shouldAdvance) {
            lastAdvanceTime = now;
        }

        for (let i = 0; i < drops.length; i++) {
            const char = chars[Math.floor(Math.random() * chars.length)];
            const x = i * fontSize;
            const y = drops[i] * fontSize;

            // Leading char is bright; rest are accent colour.
            ctx.fillStyle = Math.random() > 0.985 ? '#ffffff' : accent;
            ctx.fillText(char, x, y);

            if (shouldAdvance) {
                if (y > canvas.offsetHeight && Math.random() > 0.985) {
                    drops[i] = 0;
                }
                drops[i] += DROP_SPEED;
            }
        }
        requestAnimationFrame(draw);
    }

    requestAnimationFrame(draw);
}

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('matrix-canvas');
    if (canvas) startMatrixRain(canvas);
});
