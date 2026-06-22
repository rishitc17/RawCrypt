// Matrix-rain effect for the hero on the home page.
// Adapted from the classic matrix rain pattern: dense columns of Latin
// letters falling at a fixed speed, with a trailing fade.

function startMatrixRain(canvas) {
    const ctx = canvas.getContext('2d');

    function resize() {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    // Dense Latin letters (repeated for higher frequency of common letters).
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVXYZABCDEFGHIJKLMNOPQRSTUVXYZABCDEFGHIJKLMNOPQRSTUVXYZABCDEFGHIJKLMNOPQRSTUVXYZABCDEFGHIJKLMNOPQRSTUVXYZABCDEFGHIJKLMNOPQRSTUVXYZ'.split('');
    const fontSize = 10;
    let columns = Math.floor(canvas.width / fontSize);

    // Each drop starts at a random position so the rain doesn't all
    // start at the same time.
    let drops = [];
    for (let i = 0; i < columns; i++) {
        drops[i] = Math.floor(Math.random() * -50);
    }

    function recomputeColumns() {
        const newColumns = Math.floor(canvas.width / fontSize);
        const newDrops = [];
        for (let i = 0; i < newColumns; i++) {
            newDrops[i] = (drops[i] !== undefined) ? drops[i] : Math.floor(Math.random() * -50);
        }
        columns = newColumns;
        drops = newDrops;
    }
    window.addEventListener('resize', recomputeColumns);

    let running = true;
    document.addEventListener('visibilitychange', () => {
        running = !document.hidden;
    });

    function draw() {
        if (!running) {
            setTimeout(draw, 100);
            return;
        }

        const isDark = currentThemeIsDark();
        // Trailing fade — translucent fill over the whole canvas.
        // Light mode uses a stronger fade so old chars disappear faster,
        // keeping the canvas bright instead of muddy.
        ctx.fillStyle = isDark ? 'rgba(15, 14, 12, 0.1)' : 'rgba(250, 246, 239, 0.18)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // In light mode, use a darker, more saturated orange so the rain
        // is clearly visible on the cream background. In dark mode, the
        // neon green accent is already bright.
        const accent = isDark
            ? (cssVar('--accent') || '#a3e635')
            : '#c25a1a';  // dark orange — high contrast on cream
        const leadColor = isDark ? '#ffffff' : '#a83d0e';  // darker for leading char
        ctx.font = `bold ${fontSize}px 'IBM Plex Mono', monospace`;

        for (let i = 0; i < drops.length; i++) {
            const text = letters[Math.floor(Math.random() * letters.length)];
            // Occasional bright white "leading" character for depth.
            ctx.fillStyle = Math.random() > 0.975 ? leadColor : accent;
            ctx.fillText(text, i * fontSize, drops[i] * fontSize);
            drops[i]++;
            if (drops[i] * fontSize > canvas.height && Math.random() > 0.95) {
                drops[i] = 0;
            }
        }
    }

    // Fixed-speed loop: 33ms interval (~30fps), independent of frame rate.
    setInterval(draw, 33);
}

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('matrix-canvas');
    if (canvas) startMatrixRain(canvas);
});
