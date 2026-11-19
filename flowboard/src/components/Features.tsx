import Icon from './Icon.tsx';
import Reveal from './Reveal.tsx';
import { useLang } from '../context/LanguageContext.tsx'; // 🆕 🌐
import type { PointerEvent } from 'react';

// 🔦 Mouse irukkura idaththula card mele mella velichcham (CSS --mx / --my)
function spotlight(e: PointerEvent<HTMLDivElement>) {
  const card = (e.target as HTMLElement).closest<HTMLElement>('.feature');
  if (!card) return;
  const box = card.getBoundingClientRect();
  card.style.setProperty('--mx', `${e.clientX - box.left}px`);
  card.style.setProperty('--my', `${e.clientY - box.top}px`);
}

// Icons varisai, text i18n.js la (features.items)
const icons = ['board', 'zap', 'users', 'chart', 'lock', 'check'] as const;

export default function Features() {
  const { t } = useLang();
  return (
    <section className="section" id="features">
      <div className="container">
        <Reveal className="section__head">
          <span className="eyebrow">{t('features.eyebrow')}</span>
          <h2>{t('features.title')}</h2>
          <p>{t('features.subtitle')}</p>
        </Reveal>

        <div className="grid grid--3" onPointerMove={spotlight}>
          {t('features.items').map((f: { title: string; text: string }, i: number) => (
            <Reveal key={i} delay={i * 80} className="card feature">
              <span className="feature__icon"><Icon name={icons[i]} size={22} /></span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
