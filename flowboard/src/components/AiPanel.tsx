import { useState } from 'react';
import { api } from '../api.ts';
import type { FormEvent } from 'react';
import type { Priority, Task } from '../types.ts';
import { trackEvent } from '../analytics.ts';

// 🤖 AI task generator: goal type pannaa Claude tasks suggest pannum, user select panni add pannalaam
// boardId = endha board ku add pannanum, onAdded(tasks) = add aanadhum board ku sollu
interface Suggestion {
  title: string;
  description: string;
  priority: Priority;
  dueDate: string | null;
}
interface Props {
  boardId: string;
  onAdded: (created: Task[]) => void;
  onClose: () => void;
}

export default function AiPanel({ boardId, onAdded, onClose }: Props) {
  const [goal, setGoal] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set()); // ✅ tick panna suggestions (index)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [demo, setDemo] = useState(false); // 🆕 🎭 real AI illa, templates

  // ✨ Generate
  const generate = async (e: FormEvent) => {
    e.preventDefault();
    if (goal.trim().length < 3) return;
    setBusy(true);
    setError('');
    setSuggestions([]);
    try {
      const data = await api('/api/ai/tasks', 'POST', { goal });
      trackEvent('ai_used'); // 📊
      setSuggestions(data.tasks);
      setDemo(Boolean(data.demo));
      setPicked(new Set(data.tasks.map((_: unknown, i: number) => i))); // default ah ellaam tick
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (i: number) =>
    setPicked((p) => {
      const next = new Set(p);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  // ➕ Tick panna tasks ah board la save
  const addPicked = async () => {
    const chosen = suggestions.filter((_, i) => picked.has(i));
    if (!chosen.length) return;
    setBusy(true);
    setError('');
    try {
      const created = await api('/api/tasks/bulk', 'POST', { boardId, tasks: chosen });
      onAdded(created);
      setSuggestions([]);
      setGoal('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ai-panel">
      <div className="ai-panel__head">
        <strong>🤖 AI task generator</strong>
        <button type="button" className="icon-x" onClick={onClose} aria-label="Close AI panel">×</button>
      </div>

      <form className="inline-add" onSubmit={generate}>
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder='Describe a goal, e.g. "Plan a birthday party"'
          maxLength={300}
          aria-label="Goal for the AI"
          autoFocus
        />
        <button type="submit" className="btn btn--primary" disabled={busy || goal.trim().length < 3}>
          {busy && !suggestions.length ? 'Thinking…' : '✨ Generate'}
        </button>
      </form>

      {error && <p className="modal__error">{error}</p>}

      {suggestions.length > 0 && (
        <>
          {/* 🆕 🎭 Honest ah sollu: ithu template, real AI illa */}
          {demo && (
            <p className="ai-panel__demo">
              🎭 Demo suggestions from built-in templates. Add an Anthropic API key on the server for real AI.
            </p>
          )}
          <ul className="ai-panel__list">
            {suggestions.map((s, i) => (
              <li key={i}>
                <label>
                  <input type="checkbox" checked={picked.has(i)} onChange={() => toggle(i)} />
                  <span className={`tag tag--${s.priority}`}>{s.priority}</span>
                  <span className="ai-panel__title">{s.title}</span>
                  {s.dueDate && <small>📅 {s.dueDate}</small>}
                </label>
                {s.description && <p>{s.description}</p>}
              </li>
            ))}
          </ul>
          <div className="modal__actions">
            <button type="button" className="btn btn--outline" onClick={() => setSuggestions([])}>Discard</button>
            <button type="button" className="btn btn--primary" onClick={addPicked} disabled={busy || picked.size === 0}>
              Add {picked.size} task{picked.size === 1 ? '' : 's'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
