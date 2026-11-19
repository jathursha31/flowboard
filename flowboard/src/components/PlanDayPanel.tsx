import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { useLang } from '../context/LanguageContext.tsx';
import type { Priority } from '../types.ts';

// 🌅 Plan my day: AI (illa simple rules) innaikku pannavendiya 3 tasks + kaaranam
interface Why {
  key: string;
  n?: number;
  mine: boolean;
}
export interface PlanTask {
  id: string;
  title: string;
  priority: Priority;
  dueDate: string | null;
  boardId: string;
  boardName: string;
}
interface Plan {
  picks: { task: PlanTask; reason: string; why?: Why }[];
  demo: boolean;
}
interface Props {
  onOpenTask: (task: PlanTask) => void;
  onClose: () => void;
}

export default function PlanDayPanel({ onOpenTask, onClose }: Props) {
  const { t } = useLang();
  const [data, setData] = useState<Plan | null>(null);
  const [error, setError] = useState('');

  // 🌐 Server anuppura code ah ungal mozhila (AI kaaranam na apdiye)
  const describe = (why: Why, priority: Priority) =>
    [t(`plan.why.${why.key}`, { n: why.n, p: t(`board.${priority}`) }), why.mine && t('plan.why.mine')].filter(Boolean).join(' · ');

  useEffect(() => {
    api<Plan>('/api/ai/plan-day', 'POST')
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <section className="plan-day" aria-labelledby="plan-day-title">
      <div className="plan-day__head">
        <h3 id="plan-day-title">{t('plan.title')}</h3>
        <button type="button" className="icon-x" onClick={onClose} aria-label={t('plan.close')}>×</button>
      </div>

      {error && <p className="modal__error">{error}</p>}
      {!data && !error && <p className="muted">{t('plan.loading')}</p>}
      {data && data.picks.length === 0 && <p className="muted">{t('plan.empty')}</p>}

      {data && data.picks.length > 0 && (
        <ol className="plan-day__list">
          {data.picks.map(({ task, reason, why }, i) => (
            <li key={task.id}>
              <span className="plan-day__num">{i + 1}</span>
              <div>
                <button type="button" className="plan-day__task" onClick={() => onOpenTask(task)}>
                  {task.title}
                </button>
                <small>
                  {why ? describe(why, task.priority) : reason} · {task.boardName}
                </small>
              </div>
              <span className={`tag tag--${task.priority}`}>{t(`board.${task.priority}`)}</span>
            </li>
          ))}
        </ol>
      )}
      {data?.demo && <p className="plan-day__note">{t('plan.demo')}</p>}
    </section>
  );
}
