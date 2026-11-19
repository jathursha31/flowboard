import { useState } from 'react';
import { useLang } from '../context/LanguageContext.tsx'; // 🆕 🌐
import type { FormEvent } from 'react';

// Column titles i18n.js la (footer.columns), links English laye (product names)
const columns = [
  { links: ['Features', 'Pricing', 'Integrations', 'Changelog'] },
  { links: ['About', 'Careers', 'Blog', 'Press'] },
  { links: ['Help centre', 'Guides', 'API docs', 'Status'] },
];

export default function Footer() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const { t } = useLang();
  const titles = t('footer.columns');

  const subscribe = (e: FormEvent) => {
    e.preventDefault();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setDone(true);
      setEmail('');
    }
  };

  return (
    <footer className="footer">
      <div className="container footer__grid">
        <div className="footer__brand">
          <a href="#top" className="brand" aria-label="Flowboard home">
            <img src="/logo.svg" alt="" width="32" height="32" />
            <span>Flowboard</span>
          </a>
          <p>{t('footer.tagline')}</p>
          <form className="newsletter" onSubmit={subscribe}>
            <label className="sr-only" htmlFor="news-email">Email for newsletter</label>
            <input
              id="news-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setDone(false);
              }}
              placeholder={t('footer.emailPlaceholder')}
            />
            <button className="btn btn--primary" type="submit">{t('footer.subscribe')}</button>
          </form>
          {done && <small className="newsletter__ok">{t('footer.subscribed')}</small>}
        </div>

        {columns.map((c, i) => (
          <div key={i} className="footer__col">
            <h3>{titles[i]}</h3>
            <ul>
              {c.links.map((l) => (
                <li key={l}><a href="#top">{l}</a></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="container footer__bottom">
        <span>© {new Date().getFullYear()} Flowboard. {t('footer.rights')}</span>
        <span>Built with React</span>
      </div>
    </footer>
  );
}
