import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon.tsx';
import { useLang } from '../context/LanguageContext.tsx'; // 🆕 🌐

export default function Hero() {
  const { t, lang } = useLang();
  const words = t('hero.words');
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0); // mozhi maarinaa mudhal vaarthai la irunthu
    const id = setInterval(() => setIndex((i) => (i + 1) % words.length), 2600);
    return () => clearInterval(id);
  }, [words.length, lang]);

  // 🆕 "{word}" idathula maarura vaarthai (Tamil la vaarthai order vera, athunaala template)
  const rotator = (
    <span className="rotator" aria-live="polite">
      <span key={`${lang}-${index}`} className="rotator__word gradient-text">
        {words[index]}
      </span>
    </span>
  );

  return (
    <section className="hero" id="top">
      <div className="hero__glow hero__glow--a" />
      <div className="hero__glow hero__glow--b" />
      <div className="container hero__inner">
        <div className="hero__copy">
          <span className="pill fade-up">
            <span className="pill__dot" /> {t('hero.pill')}
          </span>
          <h1 className="fade-up" style={{ animationDelay: '80ms' }}>
            {t('hero.lines').map((line: string, i: number) => {
              const [before, after] = line.split('{word}');
              return (
                <span key={i}>
                  {i > 0 && <br />}
                  {before}
                  {after !== undefined && rotator}
                  {after}
                </span>
              );
            })}
          </h1>
          <p className="hero__lead fade-up" style={{ animationDelay: '160ms' }}>
            {t('hero.lead')}
          </p>
          <div className="hero__cta fade-up" style={{ animationDelay: '240ms' }}>
            <Link to="/signin" className="btn btn--primary btn--lg" data-track="cta_click">
              {t('hero.ctaPrimary')} <Icon name="arrow" size={18} />
            </Link>
            <a href="#demo" className="btn btn--ghost btn--lg">
              <Icon name="play" size={16} filled /> {t('hero.ctaSecondary')}
            </a>
          </div>
          <ul className="hero__checks fade-up" style={{ animationDelay: '320ms' }}>
            {t('hero.checks').map((c: string) => (
              <li key={c}><Icon name="check" size={16} /> {c}</li>
            ))}
          </ul>
        </div>

        <div className="hero__visual fade-up" style={{ animationDelay: '200ms' }} aria-hidden="true">
          <div className="mock">
            <div className="mock__bar">
              <span /><span /><span />
              <div className="mock__url">app.flowboard.io/sprint-24</div>
            </div>
            <div className="mock__body">
              <div className="mock__side">
                <div className="mock__item mock__item--active" />
                <div className="mock__item" />
                <div className="mock__item" />
                <div className="mock__item" />
              </div>
              {/* 🆕 🎬 Mini kanban: oru card To do → Doing → Done ku nagarum */}
              <div className="mock__main">
                <div className="kb">
                  {[['dot--indigo', [70, 52]], ['dot--amber', [60, 80]], ['dot--green', [66, 45]]].map(([dot, widths], c) => (
                    <div key={c} className="kb__col">
                      <div className="kb__head"><i className={`dot ${dot}`} /><b /></div>
                      <div className="kb__slot" />
                      {(widths as number[]).map((w, i) => (
                        <div key={i} className="kb__card" style={{ animationDelay: `${500 + (c * 2 + i) * 90}ms` }}>
                          <b style={{ width: `${w}%` }} />
                          <b style={{ width: `${w - 25}%` }} />
                        </div>
                      ))}
                    </div>
                  ))}
                  <div className="kb__card kb__card--moving">
                    <b style={{ width: '72%' }} />
                    <b style={{ width: '44%' }} />
                    <span className="kb__check"><Icon name="check" size={12} /></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="float-card float-card--a">
            <span className="float-card__icon"><Icon name="check" size={16} /></span>
            <div>
              <strong>Task completed</strong>
              <small>Design review · just now</small>
            </div>
          </div>
          <div className="float-card float-card--b">
            <div className="avatars">
              <span style={{ background: '#db2777' }}>AK</span>
              <span style={{ background: '#2563eb' }}>JN</span>
              <span style={{ background: '#047857' }}>RS</span>
            </div>
            <small>3 teammates online</small>
          </div>
        </div>
      </div>
    </section>
  );
}
