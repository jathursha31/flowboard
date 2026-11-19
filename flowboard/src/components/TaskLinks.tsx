import { useState } from 'react';
import { useLang } from '../context/LanguageContext.tsx';
import type { FormEvent } from 'react';
import type { TaskLink } from '../types.ts';

// 🔗 Task popup la: Google Drive / Docs / Sheets / Slides link paste panni serkka
const ICONS: Record<TaskLink['kind'], string> = { drive: '📁', docs: '📝', sheets: '📊', slides: '📽️', forms: '📋', link: '🔗' };

interface Props {
  links: TaskLink[];
  readOnly?: boolean;
  onAdd: (url: string) => Promise<void>;
  onRemove: (linkId: string) => Promise<void>;
}

export default function TaskLinks({ links, readOnly = false, onAdd, onRemove }: Props) {
  const { t } = useLang();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Form kulla form vaikka mudiyaadhu (TaskModal oru form): adhanaala Enter / button la naame anuppurom
  const add = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setError('');
    try {
      await onAdd(url.trim());
      setUrl('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal__section task-links">
      <div className="modal__section-head">
        <span>{t('links.title')}</span>
        <small>{links.length}/10</small>
      </div>
      {links.length > 0 && (
        <ul className="task-links__list">
          {links.map((l) => (
            <li key={l.id}>
              <span aria-hidden="true">{ICONS[l.kind]}</span>
              {/* https mattum server accept pannum; noopener: thirakkura page namma tab ah thoda mudiyaadhu */}
              <a href={l.url} target="_blank" rel="noopener noreferrer">{l.title}</a>
              {!readOnly && (
                <button type="button" className="icon-x" onClick={() => onRemove(l.id)} aria-label={`${t('links.remove')}: ${l.title}`}>×</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && links.length < 10 && (
        <div className="inline-add">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder={t('links.placeholder')}
            aria-label={t('links.placeholder')}
            maxLength={500}
          />
          <button type="button" className="btn btn--outline" onClick={() => add()} disabled={!url.trim() || busy}>{t('links.add')}</button>
        </div>
      )}
      {error && <p className="modal__error">{error}</p>}
      <p className="muted small">{t('links.hint')}</p>
    </div>
  );
}
