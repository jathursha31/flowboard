import { useEffect, useState } from 'react';
import Reveal from './Reveal.tsx';
import { api } from '../api.ts';
import { useLang } from '../context/LanguageContext.tsx';

// 📰 "What's new": admin page la post panna updates (illana section kaattaadhu)
export default function Updates() {
  const { t, locale } = useLang();
  const [items, setItems] = useState<{ id: string; title: string; body: string; createdAt: string }[]>([]);

  useEffect(() => {
    api('/api/updates')
      .then(setItems)
      .catch(() => {});
  }, []);

  if (!items.length) return null; // kaali section vendaam

  return (
    <section className="section" id="updates">
      <div className="container container--narrow">
        <Reveal className="section__head">
          <span className="eyebrow">{t('updates.eyebrow')}</span>
          <h2>{t('updates.title')}</h2>
        </Reveal>

        <ol className="updates">
          {items.map((u, i) => (
            <Reveal as="li" key={u.id} delay={i * 60} className="card update">
              <time dateTime={u.createdAt}>
                {new Date(u.createdAt).toLocaleDateString(locale, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </time>
              <h3>{u.title}</h3>
              <p>{u.body}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
