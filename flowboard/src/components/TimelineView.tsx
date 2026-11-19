import { useMemo } from 'react';
import { useLang } from '../context/LanguageContext.tsx';
import type { CSSProperties } from 'react';
import type { Task } from '../types.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS = 42; // 6 vaaram varaikkum kaattu

// "2026-10-24" ↔ Date (local time, naal mattum)
const toDay = (d: string | number | Date): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const fromKey = (key: string): Date => toDay(`${key}T00:00`);

// 📊 Timeline (Gantt): ovvoru task um create aana naal la irunthu due date varaikkum oru bar
interface Props {
  tasks: Task[];
  doneColumn: string | undefined;
  onOpen: (task: Task) => void;
}
interface Row {
  task: Task & { dueDate: string };
  from: number;
  to: number;
}

export default function TimelineView({ tasks, doneColumn, onOpen }: Props) {
  const { t, locale } = useLang();

  const { rows, days, todayIndex } = useMemo(() => {
    const dated = tasks.filter((task): task is Task & { dueDate: string } => Boolean(task.dueDate)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    if (!dated.length) return { rows: [] as Row[], days: [] as Date[], todayIndex: -1 };

    const today = toDay(Date.now());
    const starts = dated.map((task) => Math.min(toDay(task.createdAt ?? today).getTime(), fromKey(task.dueDate).getTime()));
    let first = Math.min(today.getTime() - 3 * DAY_MS, ...starts);
    const last = Math.max(today.getTime() + 7 * DAY_MS, ...dated.map((task) => fromKey(task.dueDate).getTime())) + DAY_MS;
    first = Math.max(first, last - MAX_DAYS * DAY_MS); // romba pazhasu na vettu
    const count = Math.round((last - first) / DAY_MS);

    const list = Array.from({ length: count }, (_, i) => new Date(first + i * DAY_MS));
    const index = (time: number) => Math.min(count - 1, Math.max(0, Math.round((time - first) / DAY_MS)));
    return {
      days: list,
      todayIndex: index(today.getTime()),
      rows: dated.map((task, i) => ({ task, from: index(starts[i]), to: index(fromKey(task.dueDate).getTime()) })),
    };
  }, [tasks]);

  if (!rows.length) return <p className="timeline__empty">{t('timeline.empty')}</p>;

  return (
    <div className="timeline" style={{ '--days': days.length } as CSSProperties}>
      <div className="timeline__grid" role="table" aria-label={t('board.viewTimeline')}>
        <div className="timeline__row timeline__row--head" role="row">
          <span className="timeline__label" role="columnheader" />
          {days.map((d, i) => (
            <span key={d.getTime()} role="columnheader" className={`timeline__day ${i === todayIndex ? 'is-today' : ''} ${[0, 6].includes(d.getDay()) ? 'is-weekend' : ''}`}>
              {d.getDate() === 1 || i === 0 ? d.toLocaleDateString(locale, { month: 'short', day: 'numeric' }) : d.getDate()}
            </span>
          ))}
        </div>

        {rows.map(({ task, from, to }) => (
          <div key={task.id} className="timeline__row" role="row">
            <button type="button" className="timeline__label" role="rowheader" onClick={() => onOpen(task)} title={task.title}>
              {task.title}
            </button>
            <div className="timeline__track" role="cell" style={{ gridColumn: `2 / span ${days.length}` }}>
              <span className="timeline__today" style={{ left: `calc(${(todayIndex + 0.5) / days.length} * 100%)` }} aria-hidden="true" />
              <button
                type="button"
                className={`timeline__bar timeline__bar--${task.priority} ${task.column === doneColumn ? 'is-done' : ''}`}
                style={{ left: `calc(${from / days.length} * 100%)`, width: `calc(${(to - from + 1) / days.length} * 100%)` }}
                onClick={() => onOpen(task)}
                aria-label={`${task.title}: ${new Date(`${task.dueDate}T00:00`).toLocaleDateString(locale, { month: 'short', day: 'numeric' })}`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
