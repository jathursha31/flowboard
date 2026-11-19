import { useEffect, useRef, useState } from 'react';
import { api } from '../api.ts';
import { trackEvent } from '../analytics.ts';
import { useLang } from '../context/LanguageContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import type { FormEvent } from 'react';

// 🤖 AI assistant: "ennoda overdue tasks enna?" nu kelunga, ungal tasks vechu badhil
// Badhil la varra tasks click pannaa andha task thirakkum

interface FoundTask {
  id: string;
  title: string;
  board: string;
  boardId: string;
  due: string | null;
}
interface Turn {
  role: 'user' | 'assistant';
  content: string;
  tasks?: FoundTask[];
}
interface Props {
  onOpenTask: (task: FoundTask) => void;
  onClose: () => void;
}

// Demo mode English / Tanglish keywords la vela seiyum: adhanaala suggestions English la
const SUGGESTIONS = ['What is overdue?', 'What is due this week?', 'Show my high priority tasks'];

export default function AssistantPanel({ onOpenTask, onClose }: Props) {
  const { t } = useLang();
  const toast = useToast();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight });
  }, [turns, busy]);

  const ask = async (question: string, e?: FormEvent) => {
    e?.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    const history = turns.slice(-6).map(({ role, content }) => ({ role, content }));
    setTurns((list) => [...list, { role: 'user', content: q }]);
    setText('');
    setBusy(true);
    try {
      const res = await api<{ answer: string; tasks: FoundTask[]; demo: boolean }>('/api/ai/assistant', 'POST', { question: q, history });
      setDemo(res.demo);
      setTurns((list) => [...list, { role: 'assistant', content: res.answer, tasks: res.tasks }]);
      trackEvent('ai_used');
    } catch (err) {
      toast((err as Error).message, 'error');
      setTurns((list) => list.slice(0, -1)); // kelvi poagala: thirumba type panna vidu
      setText(q);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="activity-panel assistant-panel" aria-label={t('assistant.title')}>
      <div className="plan-day__head">
        <h3>{t('assistant.title')}</h3>
        <button type="button" className="icon-x" onClick={onClose} aria-label={t('plan.close')}>×</button>
      </div>
      {demo && <p className="muted small">🎭 {t('assistant.demo')}</p>}

      <ol className="chat" ref={listRef} aria-live="polite">
        {turns.length === 0 && (
          <li className="assistant__intro">
            <p className="muted">{t('assistant.intro')}</p>
            <div className="assistant__chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="chip" onClick={() => ask(s)}>{s}</button>
              ))}
            </div>
          </li>
        )}
        {turns.map((turn, i) => (
          <li key={i} className={`chat__msg ${turn.role === 'user' ? 'is-mine' : ''}`}>
            <div className="chat__bubble">
              <p className="chat__text">{turn.content}</p>
              {turn.tasks && turn.tasks.length > 0 && (
                <ul className="assistant__tasks">
                  {turn.tasks.map((task) => (
                    <li key={task.id}>
                      <button type="button" className="link-btn" onClick={() => onOpenTask(task)}>{task.title}</button>
                      <small className="muted"> · {task.board}{task.due ? ` · ${task.due}` : ''}</small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
        {busy && <li className="muted chat__empty">{t('assistant.thinking')}</li>}
      </ol>

      <form className="chat__form" onSubmit={(e) => ask(text, e)}>
        <label className="sr-only" htmlFor="assistant-input">{t('assistant.placeholder')}</label>
        <input
          id="assistant-input"
          className="assistant__input"
          value={text}
          maxLength={500}
          placeholder={t('assistant.placeholder')}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="btn btn--primary" disabled={!text.trim() || busy}>{t('assistant.send')}</button>
      </form>
    </section>
  );
}
