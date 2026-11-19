import { useState } from 'react';
import Icon from './Icon.tsx';
import Reveal from './Reveal.tsx';
import { useLang } from '../context/LanguageContext.tsx'; // 🆕 🌐 (kelvi-badhil i18n.js la)

export default function FAQ() {
  const [open, setOpen] = useState(0);
  const { t } = useLang();

  return (
    <section className="section" id="faq">
      <div className="container container--narrow">
        <Reveal className="section__head">
          <span className="eyebrow">{t('faq.eyebrow')}</span>
          <h2>{t('faq.title')}</h2>
        </Reveal>

        <div className="faq">
          {t('faq.items').map((f: { q: string; a: string }, i: number) => {
            const isOpen = open === i;
            return (
              <Reveal key={i} delay={i * 60} className={`faq__item ${isOpen ? 'is-open' : ''}`}>
                <button
                  className="faq__q"
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-${i}`}
                >
                  {f.q}
                  <Icon name="chevron" className="faq__icon" />
                </button>
                <div className="faq__a" id={`faq-${i}`} role="region">
                  <div>
                    <p>{f.a}</p>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
