import { useState } from 'react';
import Icon from './Icon.tsx';
import Reveal from './Reveal.tsx';
import { useLang } from '../context/LanguageContext.tsx'; // 🆕 🌐
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';
import { useConfig } from '../hooks/useConfig.ts';

// Peru + vilai inga, text (blurb / features / button) i18n.js la (pricing.plans)
const plans = [
  { name: 'Starter', monthly: 0 },
  { name: 'Pro', monthly: 12, popular: true },
  { name: 'Business', monthly: 24 },
];

export default function Pricing() {
  const [yearly, setYearly] = useState(true);
  const { t } = useLang();
  const texts = t('pricing.plans');
  const { user } = useAuth();
  const { billingEnabled } = useConfig(); // 💳 payments on na Pro button Stripe ku pogum

  return (
    <section className="section" id="pricing">
      <div className="container">
        <Reveal className="section__head">
          <span className="eyebrow">{t('pricing.eyebrow')}</span>
          <h2>{t('pricing.title')}</h2>
          <p>{t('pricing.subtitle')}</p>
        </Reveal>

        <Reveal className="billing">
          <span className={!yearly ? 'is-active' : ''}>{t('pricing.monthly')}</span>
          <button
            className={`switch ${yearly ? 'is-on' : ''}`}
            role="switch"
            aria-checked={yearly}
            aria-label="Bill yearly"
            onClick={() => setYearly((y) => !y)}
          >
            <span />
          </button>
          <span className={yearly ? 'is-active' : ''}>
            {t('pricing.yearly')} <em className="save">{t('pricing.save')}</em>
          </span>
        </Reveal>

        <div className="grid grid--3 pricing">
          {plans.map((p, i) => {
            const price = yearly ? Math.round(p.monthly * 0.8) : p.monthly;
            const text = texts[i];
            return (
              <Reveal key={p.name} delay={i * 100} className={`card plan ${p.popular ? 'plan--popular' : ''}`}>
                {p.popular && <span className="plan__badge">{t('pricing.popular')}</span>}
                <h3>{p.name}</h3>
                <p className="plan__blurb">{text.blurb}</p>
                <div className="plan__price">
                  <span className="plan__amount" key={price}>${price}</span>
                  <span className="plan__per">{t('pricing.perUser')}</span>
                </div>
                <small className="plan__billed">
                  {p.monthly === 0
                    ? t('pricing.freeForever')
                    : yearly
                      ? t('pricing.billedYearly').replace('{amount}', String(price * 12))
                      : t('pricing.billedMonthly')}
                </small>
                <ul className="plan__features">
                  {text.features.map((f: string) => (
                    <li key={f}><Icon name="check" size={16} /> {f}</li>
                  ))}
                </ul>
                {p.name === 'Pro' && billingEnabled ? (
                  <Link to={user ? '/account#plan' : '/signin'} data-track="pricing_click" className="btn btn--primary btn--block">
                    {text.cta}
                  </Link>
                ) : (
                  <a href="#contact" data-track="pricing_click" className={`btn ${p.popular ? 'btn--primary' : 'btn--outline'} btn--block`}>
                    {text.cta}
                  </a>
                )}
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
