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
    const fontSize = 16;
    let columns = Math.floor(canvas.offsetWidth / fontSize);
    let drops = new Array(columns).fill(0).map(() => Math.random() * -100);
    // Constant slow speed: advance drops every 6 frames, capped.
    const FRAMES_PER_STEP = 6;
    let frameCount = 0;
    // Cap the maximum drop speed to prevent hyperliminal acceleration.
    const MAX_DROP_SPEED = 0.4;

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

        // Translucent fill for the trailing fade effect — slower trails.
        const isDark = currentThemeIsDark();
        ctx.fillStyle = isDark ? 'rgba(15, 14, 12, 0.03)' : 'rgba(250, 246, 239, 0.03)';
        ctx.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

        const accent = cssVar('--accent') || (isDark ? '#a3e635' : '#e8702a');
        ctx.font = `${fontSize}px 'IBM Plex Mono', monospace`;

        // Only advance drops every N frames — constant slow speed.
        const advance = (frameCount % FRAMES_PER_STEP === 0);
        frameCount++;

        for (let i = 0; i < drops.length; i++) {
            const char = chars[Math.floor(Math.random() * chars.length)];
            const x = i * fontSize;
            const y = drops[i] * fontSize;

            // Leading char is bright; rest are accent colour.
            ctx.fillStyle = Math.random() > 0.985 ? '#ffffff' : accent;
            ctx.fillText(char, x, y);

            if (advance) {
                if (y > canvas.offsetHeight && Math.random() > 0.985) {
                    drops[i] = 0;
                }
                // Capped constant speed — no acceleration.
                drops[i] += MAX_DROP_SPEED;
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
