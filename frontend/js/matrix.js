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
    // Slow fall: drops advance every N frames instead of every frame.
    const FRAMES_PER_STEP = 4;
    let frameCount = 0;

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
        ctx.fillStyle = isDark ? 'rgba(14, 13, 10, 0.04)' : 'rgba(244, 239, 228, 0.04)';
        ctx.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

        const accent = cssVar('--accent') || (isDark ? '#c4ff42' : '#d8541b');
        ctx.font = `${fontSize}px 'IBM Plex Mono', monospace`;

        // Only advance drops every N frames — slows the rain.
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
                drops[i] += 0.5;
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
