import { useMemo, useState } from 'react';
import type { Task } from '../types.ts';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Date → "2026-10-22" (ungal computer time la)
function dayKey(date: Date): string {
  return date.toLocaleDateString('en-CA');
}

// 📅 Month calendar: due date ulla tasks ah naal vaariyaa kaattum
// tasks = (filter / search aana) tasks, doneColumn = "mudinjadhu" column id, onOpen(task) = edit popup
interface Props {
  tasks: Task[];
  doneColumn: string | undefined;
  onOpen: (task: Task) => void;
}

export default function CalendarView({ tasks, doneColumn, onOpen }: Props) {
  // Ippo kaattura maasam (1-aam thethi)
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const today = dayKey(new Date());

  // 🗂️ Due date vaariyaa tasks ah pirichu vai: { "2026-10-22": [task, task] }
  const byDay = useMemo(() => {
    const map = new Map();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      if (!map.has(t.dueDate)) map.set(t.dueDate, []);
      map.get(t.dueDate).push(t);
    }
    return map;
  }, [tasks]);

  const noDate = tasks.filter((t) => !t.dueDate);

  // 📆 Grid: maasaththin mudhal vaaram Monday la aarambikkanum, 6 vaaram (42 kattam)
  const cells = useMemo(() => {
    const start = new Date(month);
    const offset = (start.getDay() + 6) % 7; // Sunday=0 → Monday mudhal
    start.setDate(start.getDate() - offset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [month]);

  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const goToday = () => {
    const d = new Date();
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  return (
    <div className="calendar">
      <div className="calendar__head">
        <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
        <h3>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
        <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="Next month">›</button>
        <button type="button" className="chip" onClick={goToday}>Today</button>
      </div>

      <div className="calendar__grid" role="grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="calendar__weekday" role="columnheader">{w}</div>
        ))}
        {cells.map((d) => {
          const key = dayKey(d);
          const items = byDay.get(key) ?? [];
          const outside = d.getMonth() !== month.getMonth();
          return (
            <div
              key={key}
              role="gridcell"
              className={`calendar__day ${outside ? 'is-outside' : ''} ${key === today ? 'is-today' : ''}`}
            >
              <span className="calendar__num">{d.getDate()}</span>
              {items.slice(0, 3).map((t: Task) => (
                <button
                  key={t.id}
                  type="button"
                  className={`calendar__task calendar__task--${t.priority} ${t.column === doneColumn ? 'is-done' : ''}`}
                  onClick={() => onOpen(t)}
                  title={t.title}
                >
                  {t.title}
                </button>
              ))}
              {items.length > 3 && <small className="calendar__more">+{items.length - 3} more</small>}
            </div>
          );
        })}
      </div>

      {noDate.length > 0 && (
        <div className="calendar__nodate">
          <span>No due date ({noDate.length}):</span>
          {noDate.map((t) => (
            <button key={t.id} type="button" className="chip" onClick={() => onOpen(t)}>{t.title}</button>
          ))}
        </div>
      )}
    </div>
  );
}
