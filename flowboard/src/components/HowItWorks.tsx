import Icon from './Icon.tsx';
import Reveal from './Reveal.tsx';
import { useLang } from '../context/LanguageContext.tsx';

// 🪜 "How it works": 3 steps (text i18n.ts la how.steps)
const icons = ['board', 'zap', 'check'] as const;

export default function HowItWorks() {
  const { t } = useLang();
  return (
    <section className="section section--alt" id="how">
      <div className="container">
        <Reveal className="section__head">
          <span className="eyebrow">{t('how.eyebrow')}</span>
          <h2>{t('how.title')}</h2>
          <p>{t('how.subtitle')}</p>
        </Reveal>

        <ol className="steps">
          {t('how.steps').map((step: { title: string; text: string }, i: number) => (
            <Reveal key={i} as="li" delay={i * 120} className="step">
              <span className="step__num" aria-hidden="true">{i + 1}</span>
              <span className="step__icon"><Icon name={icons[i]} size={22} /></span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
