import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { useLang } from '../context/LanguageContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import type { Board } from '../types.ts';

// 🗂️ "Start from a template" popup: Wedding plan, Exam prep... click pannaa ready-made board create aagum

interface TemplateInfo {
  id: string;
  name: string;
  emoji: string;
  description: string;
  taskCount: number;
  columns: string[];
}
interface Props {
  onCreated: (board: Board) => void;
  onClose: () => void;
}

export default function TemplatePicker({ onCreated, onClose }: Props) {
  const { t } = useLang();
  const toast = useToast();
  const [list, setList] = useState<TemplateInfo[] | null>(null);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    api<TemplateInfo[]>('/api/templates').then(setList, () => setList([]));
  }, []);

  const use = async (template: TemplateInfo) => {
    setBusy(template.id);
    try {
      const board = await api<Board>('/api/boards', 'POST', { template: template.id });
      toast(t('templates.created', { name: board.name }));
      onCreated(board);
    } catch (err) {
      toast((err as Error).message, 'error');
      setBusy('');
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal--wide" role="dialog" aria-modal="true" aria-labelledby="templates-title">
        <div className="plan-day__head">
          <h3 id="templates-title">{t('templates.title')}</h3>
          <button type="button" className="icon-x" onClick={onClose} aria-label={t('plan.close')}>×</button>
        </div>
        <p className="muted">{t('templates.subtitle')}</p>
        {list === null ? (
          <p className="muted">…</p>
        ) : (
          <ul className="template-grid">
            {list.map((tpl) => (
              <li key={tpl.id}>
                <button type="button" className="template-card" onClick={() => use(tpl)} disabled={Boolean(busy)} aria-label={`${t('templates.use')}: ${tpl.name}`}>
                  <span className="template-card__emoji" aria-hidden="true">{tpl.emoji}</span>
                  <strong>{tpl.name}</strong>
                  <small className="muted">{tpl.description}</small>
                  <span className="template-card__meta">
                    {t('templates.tasks', { n: tpl.taskCount })} · {tpl.columns.slice(0, 3).join(' → ')}{tpl.columns.length > 3 ? ' …' : ''}
                  </span>
                  {busy === tpl.id && <span className="template-card__busy">…</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
