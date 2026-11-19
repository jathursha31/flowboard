import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { useLang } from '../context/LanguageContext.tsx';
import { timeAgo } from '../utils/timeAgo.ts';
import type { ActivityEntry } from '../types.ts';

// 🕓 History: "Anu moved 'Logo' → In progress · 2 min ago"
// taskId kudutha andha task mattum (task popup la), illana muzhu board (Activity panel)
// refreshKey maarinaa thirumba edukkum (live update vandhaa)
interface Props {
  boardId: string;
  taskId?: string | null;
  refreshKey?: number;
  onOpenTask?: (taskId: string) => void;
}

export default function ActivityFeed({ boardId, taskId = null, refreshKey = 0, onOpenTask }: Props) {
  const { t, locale } = useLang();
  const [items, setItems] = useState<ActivityEntry[] | null>(null);

  useEffect(() => {
    let ignore = false;
    api<ActivityEntry[]>(`/api/boards/${boardId}/activity${taskId ? `?taskId=${taskId}` : ''}`)
      .then((list) => !ignore && setItems(list))
      .catch(() => !ignore && setItems([]));
    return () => {
      ignore = true;
    };
  }, [boardId, taskId, refreshKey]);

  if (items === null) return <p className="muted">…</p>;
  if (!items.length) return <p className="muted">{t('activity.empty')}</p>;

  return (
    <ol className="activity">
      {items.map((a) => (
        <li key={a.id}>
          <span className={`activity__dot activity__dot--${a.action}`} aria-hidden="true" />
          <div>
            <p>
              <strong>{a.actorName}</strong> {t(`activity.${a.action}`)}
              {!taskId &&
                (onOpenTask && a.action !== 'deleted' ? (
                  <>
                    {' '}
                    <button type="button" className="link-btn activity__task" onClick={() => onOpenTask(a.taskId)}>
                      “{a.taskTitle}”
                    </button>
                  </>
                ) : (
                  <> “{a.taskTitle}”</>
                ))}
              {a.detail && <span className="activity__detail"> {['moved', 'completed', 'assigned'].includes(a.action) ? `→ ${a.detail}` : `· ${a.action === 'edited' ? a.detail.split(', ').map((k: string) => t(`fields.${k}`)).join(', ') : a.detail}`}</span>}
            </p>
            <time dateTime={a.createdAt}>{timeAgo(a.createdAt, locale)}</time>
          </div>
        </li>
      ))}
    </ol>
  );
}
