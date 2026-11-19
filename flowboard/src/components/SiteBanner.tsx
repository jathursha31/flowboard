import { useEffect, useRef, useState } from 'react';
import { api } from '../api.ts';

const DISMISS_KEY = 'flowboard-banner-dismissed';

// 📢 Admin page la set panna announcement: ellaa pages layum mele varum
// ✕ click panna maraiyum. Admin pudhu banner pottaa (version maarum) thirumba varum.
export default function SiteBanner() {
  const [banner, setBanner] = useState<{ text: string; tone: string; version: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api('/api/banner')
      .then(({ banner: b }) => {
        let dismissed = null;
        try {
          dismissed = localStorage.getItem(DISMISS_KEY);
        } catch {
          /* storage illana eppovum kaattu */
        }
        if (b && String(b.version) !== dismissed) setBanner(b);
      })
      .catch(() => {});
  }, []);

  // 📏 Banner uyaram → --banner-h (navbar um page um athukku keezha nagarum)
  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el) return undefined;
    const observer = new ResizeObserver(() => root.style.setProperty('--banner-h', `${el.offsetHeight}px`));
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--banner-h');
    };
  }, [banner]);

  if (!banner) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(banner.version));
    } catch {
      /* ignore */
    }
    setBanner(null);
  };

  return (
    <div ref={ref} className={`site-banner site-banner--${banner.tone}`} role="status">
      <p>{banner.text}</p>
      <button type="button" onClick={dismiss} aria-label="Dismiss announcement">
        ✕
      </button>
    </div>
  );
}
