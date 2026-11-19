import { useEffect, useState } from 'react';
import { useInView } from '../hooks/useInView.ts';
import { useLang } from '../context/LanguageContext.tsx'; // 🆕 🌐

const stats = [
  { value: 4000, suffix: '+', label: 'Teams onboard' },
  { value: 32, suffix: '%', label: 'Faster delivery' },
  { value: 99.9, suffix: '%', label: 'Uptime SLA', decimals: 1 },
  { value: 4.9, suffix: '/5', label: 'Average rating', decimals: 1 },
];

function Counter({ value, suffix, decimals = 0, start }: { value: number; suffix: string; decimals?: number; start: boolean }) {
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!start) return;
    const duration = 1600;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setN(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [start, value]);

  return (
    <>
      {n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </>
  );
}

export default function Stats() {
  const [ref, inView] = useInView({ threshold: 0.4 });
  const { t } = useLang(); // 🆕 🌐
  const labels = t('stats');
  return (
    <section className="stats" ref={ref}>
      <div className="container stats__grid">
        {stats.map((s, i) => (
          <div key={s.label} className="stat">
            <strong className="gradient-text">
              <Counter {...s} start={inView} />
            </strong>
            <span>{labels[i] ?? s.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
