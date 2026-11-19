// 🎉 Confetti: task "Done" ku poana chinna kondaattam (library illaama, oru canvas la)
const COLORS = ['#5b5bf0', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

export function confetti({ x = window.innerWidth / 2, y = window.innerHeight / 3, count = 120 }: { x?: number; y?: number; count?: number } = {}): void {
  // ♿ "Animation kammi" nu setting vechavangalukku vendaam
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return; // canvas support illa

  // 🎊 Ovvoru kaagidha thundum: idam, vegam, sutral, colour
  const pieces = Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 8;
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 6, // konjam mele thookki podu
      size: 5 + Math.random() * 6,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
  });

  const start = performance.now();
  const DURATION = 1800;

  function frame(now: number) {
    if (!ctx) return;
    const elapsed = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = Math.max(0, 1 - elapsed / DURATION); // mella mella maraiyum

    for (const p of pieces) {
      p.vy += 0.25; // 🌍 gravity
      p.vx *= 0.99; // 💨 kaaththu
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }

    if (elapsed < DURATION) requestAnimationFrame(frame);
    else canvas.remove();
  }

  requestAnimationFrame(frame);
  // 🧹 Tab background la irundhaa animation nikkum: appovum canvas ah kandippaa eduththidu
  setTimeout(() => canvas.remove(), DURATION + 500);
}
