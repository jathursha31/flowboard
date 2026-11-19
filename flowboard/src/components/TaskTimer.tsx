import { useEffect, useState } from 'react';
import { useLang } from '../context/LanguageContext.tsx';
import { formatDuration, totalSeconds } from '../utils/duration.ts';
import type { Task } from '../types.ts';

export type TimerAction = 'start' | 'stop' | 'reset';

// ⏱️ Task popup la: motham neram (live ah oadum) + Start / Stop / Reset
export default function TaskTimer({ task, onTimer, readOnly = false }: { task: Task; onTimer: (action: TimerAction) => Promise<void>; readOnly?: boolean }) {
  const { t } = useLang();
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const running = Boolean(task.timerStartedAt);

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const run = async (action: TimerAction) => {
    if (action === 'reset' && !window.confirm(t('timer.confirmReset'))) return;
    setBusy(true);
    try {
      await onTimer(action);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal__section task-timer">
      <div className="modal__section-head">
        <span>{t('timer.title')}</span>
        {running && <small className="task-timer__live">● {t('timer.running')}</small>}
      </div>
      <div className="task-timer__row">
        <strong className="task-timer__time" aria-live="off">{formatDuration(totalSeconds(task, now))}</strong>
        {!readOnly && (
          <>
            <button type="button" className={`btn ${running ? 'btn--outline' : 'btn--primary'}`} onClick={() => run(running ? 'stop' : 'start')} disabled={busy}>
              {running ? t('timer.stop') : t('timer.start')}
            </button>
            {(task.timeSpent ?? 0) > 0 && !running && (
              <button type="button" className="link-btn" onClick={() => run('reset')} disabled={busy}>{t('timer.reset')}</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
