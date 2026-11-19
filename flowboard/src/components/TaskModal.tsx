import { useEffect, useRef, useState } from 'react';
import { useLang } from '../context/LanguageContext.tsx';
import ActivityFeed from './ActivityFeed.tsx';
import TaskTimer from './TaskTimer.tsx';
import TaskLinks from './TaskLinks.tsx';
import type { TimerAction } from './TaskTimer.tsx';
import type { ChangeEvent, FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { DEFAULT_LABELS } from '../types.ts';
import type { ChecklistItem, Label, Person, Priority, Repeat, Task } from '../types.ts';

const PRIORITIES = ['low', 'medium', 'high'];

// 🆕 📎 Attach panna mudiyura files (server la irukkura athe list)
const FILE_TYPES = 'image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain';
const MAX_FILE_BYTES = 2 * 1024 * 1024;

// 🆕 Checklist item ku chinna unique id
function newId() {
  return Math.random().toString(36).slice(2, 10);
}

// "153600" → "150 KB"
function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// 🆕 💬 Comment la "@Bala" maari irukkuradhai highlight pannu
function withMentions(text: string) {
  return text.split(/((?:^|\s)@[\p{L}\p{M}\p{N}_.-]{2,40})/u).map((part: string, i: number) =>
    i % 2 ? (
      <span key={i}>
        {part.match(/^\s/) ? ' ' : ''}
        <mark className="mention">{part.trim()}</mark>
      </span>
    ) : (
      part
    )
  );
}

// ✏️ Task edit popup
// task = edit panra task, onSave = save, onClose = close
// onComment(text) / onDeleteComment(id) = comments udane save aagum (Save button theva illa)
// people = share panna board la irukkuravanga (assign + @mention). Kaali na assign option kaattaadhu
// onUpload(file) / onDeleteAttachment(id) = 📎 files (login aagirundhaa mattum)
// boardId = 🕓 history ku
// readOnly = 👀 viewer: ellaam paakkalaam, edhuvum maaththa mudiyaadhu
export interface TaskChanges {
  title: string;
  description: string;
  priority: Priority;
  dueDate: string | null;
  labels: string[];
  checklist: ChecklistItem[];
  repeat: Repeat | null;
  assigneeId?: string | null;
}
interface Props {
  task: Task;
  boardId?: string | null;
  people?: Person[];
  labels?: Label[]; // 🆕 🏷️ board oda labels
  readOnly?: boolean;
  onSave: (changes: TaskChanges) => Promise<void>;
  onClose: () => void;
  onComment: (text: string) => Promise<void>;
  onDeleteComment: (commentId: string) => void | Promise<void>;
  onUpload?: (file: File) => Promise<void>;
  onDeleteAttachment?: (fileId: string) => Promise<void>;
  onTimer?: (action: TimerAction) => Promise<void>; // 🆕 ⏱️
  onAddLink?: (url: string) => Promise<void>; // 🆕 🔗
  onDeleteLink?: (linkId: string) => Promise<void>;
}

export default function TaskModal({ task, boardId, people = [], labels: boardLabels = DEFAULT_LABELS, readOnly = false, onSave, onClose, onComment, onDeleteComment, onUpload, onDeleteAttachment, onTimer, onAddLink, onDeleteLink }: Props) {
  const { t } = useLang();
  // 📝 Form la task oda ippo irukkura values ah aarambathula podu
  const [form, setForm] = useState<{
    title: string;
    description: string;
    priority: Priority;
    dueDate: string;
    labels: string[];
    checklist: ChecklistItem[];
    repeat: Repeat | '';
    assigneeId: string;
  }>({
    title: task.title,
    description: task.description,
    priority: task.priority,
    dueDate: task.dueDate ?? '',
    labels: task.labels,
    checklist: task.checklist,
    repeat: task.repeat ?? '',
    assigneeId: task.assigneeId ?? '',
  });
  const [newItem, setNewItem] = useState(''); // pudhu checklist item type pannadhu
  const [comment, setComment] = useState(''); // pudhu comment type pannadhu
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showHistory, setShowHistory] = useState(false); // 🆕 🕓
  const commentRef = useRef<HTMLInputElement>(null);

  // 🆕 💬 "@ba" type pannumbodhu board la irukkuravanga suggestions
  const mentionQuery = comment.match(/(?:^|\s)@([\p{L}\p{M}\p{N}_.-]*)$/u)?.[1];
  const suggestions =
    mentionQuery === undefined
      ? []
      : people.filter((p) => p.name.toLowerCase().replace(/\s+/g, '').startsWith(mentionQuery.toLowerCase()) || p.name.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0, 5);
  const pickMention = (person: Person) => {
    setComment((c) => c.replace(/@[\p{L}\p{M}\p{N}_.-]*$/u, `@${person.name.split(/\s+/)[0]} `));
    commentRef.current?.focus();
  };

  // 📎 File choose pannadhum upload (udane save aagum)
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // ore file ah thirumba choose panna mudiyanum
    if (!file) return;
    if (!onUpload) return;
    if (file.size > MAX_FILE_BYTES) return setError(t('task.tooBig'));
    setUploading(true);
    setError('');
    try {
      await onUpload(file);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  // ⌨️ Esc key amukkinaa popup close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const update = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  // 🏷️ Label click: irundhaa eduthudu, illana podu
  const toggleLabel = (label: string) =>
    setForm((f) => ({
      ...f,
      labels: f.labels.includes(label) ? f.labels.filter((l) => l !== label) : [...f.labels, label],
    }));

  // ☑️ Checklist: add / tick / azhi
  const addItem = () => {
    const text = newItem.trim();
    if (!text || form.checklist.length >= 30) return;
    setForm((f) => ({ ...f, checklist: [...f.checklist, { id: newId(), text, done: false }] }));
    setNewItem('');
  };
  const toggleItem = (id: string) =>
    setForm((f) => ({ ...f, checklist: f.checklist.map((i) => (i.id === id ? { ...i, done: !i.done } : i)) }));
  const removeItem = (id: string) => setForm((f) => ({ ...f, checklist: f.checklist.filter((i) => i.id !== id) }));

  const doneItems = form.checklist.filter((i) => i.done).length;

  // 💬 Comment anuppu
  const sendComment = async () => {
    const text = comment.trim();
    if (!text) return;
    try {
      await onComment(text);
      setComment('');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // 💾 Save
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError(t('task.titleRequired'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { assigneeId, ...rest } = form;
      await onSave({
        ...rest,
        dueDate: form.dueDate || null, // kaali date = null
        repeat: form.repeat || null,
        ...(people.length ? { assigneeId: assigneeId || null } : {}), // share board la mattum
      });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  // Enter amukkinaa form submit aagaama, antha box oda velai mattum pannu
  const onEnter = (fn: () => void) => (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      fn();
    }
  };

  return (
    // 🌫️ Backdrop (pinnaadi irukkura iruttu): click pannaa close
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h3 id="modal-title">{readOnly ? task.title : t('task.editTitle')}</h3>
        {readOnly && <p className="view-only-note">{t('board.viewOnly')}</p>}

        <fieldset className="modal__fields" disabled={readOnly}>

        <label>
          {t('task.title')}
          <input name="title" value={form.title} onChange={update} maxLength={80} autoFocus />
        </label>

        <label>
          {t('task.description')}
          <textarea name="description" rows={3} value={form.description} onChange={update} maxLength={1000} placeholder={t('task.descPlaceholder')} />
        </label>

        <div className="modal__row">
          <label>
            {t('board.priority')}
            <select name="priority" value={form.priority} onChange={update}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{t(`board.${p}`)}</option>
              ))}
            </select>
          </label>
          <label>
            {t('task.dueDate')}
            <input type="date" name="dueDate" value={form.dueDate} onChange={update} />
          </label>
        </div>

        {/* 🔁 Repeat + 👤 Assign */}
        <div className="modal__row">
          <label>
            {t('task.repeat')}
            <select name="repeat" value={form.repeat} onChange={update}>
              <option value="">{t('task.never')}</option>
              <option value="daily">{t('task.daily')}</option>
              <option value="weekly">{t('task.weekly')}</option>
              <option value="monthly">{t('task.monthly')}</option>
            </select>
          </label>
          {people.length > 0 && (
            <label>
              {t('task.assigned')}
              <select name="assigneeId" value={form.assigneeId} onChange={update}>
                <option value="">{t('task.nobody')}</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        {form.repeat && <p className="modal__hint">{t('task.repeatHint')}</p>}

        <fieldset className="modal__labels">
          <legend>{t('task.labels')}</legend>
          {boardLabels.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`label label--c-${l.color} ${form.labels.includes(l.id) ? 'is-on' : ''}`}
              aria-pressed={form.labels.includes(l.id)}
              onClick={() => toggleLabel(l.id)}
            >
              {l.name}
            </button>
          ))}
        </fieldset>

        {/* 🆕 ⏱️ Timer (login aagi irundhaa) */}
        {onTimer && <TaskTimer task={task} onTimer={onTimer} readOnly={readOnly} />}

        {/* 🆕 🔗 Google Drive / Docs links */}
        {onAddLink && onDeleteLink && <TaskLinks links={task.links ?? []} readOnly={readOnly} onAdd={onAddLink} onRemove={onDeleteLink} />}

        {/* ☑️ Checklist */}
        <div className="modal__section">
          <div className="modal__section-head">
            <span>{t('task.checklist')}</span>
            {form.checklist.length > 0 && <small>{t('task.doneCount', { done: doneItems, total: form.checklist.length })}</small>}
          </div>
          {form.checklist.length > 0 && (
            <div className="checklist-bar" aria-hidden="true">
              <span style={{ width: `${(doneItems / form.checklist.length) * 100}%` }} />
            </div>
          )}
          <ul className="checklist">
            {form.checklist.map((item) => (
              <li key={item.id}>
                <label className={item.done ? 'is-done' : ''}>
                  <input type="checkbox" checked={item.done} onChange={() => toggleItem(item.id)} />
                  {item.text}
                </label>
                <button type="button" className="icon-x" onClick={() => removeItem(item.id)} aria-label={`${t('task.remove')} ${item.text}`}>×</button>
              </li>
            ))}
          </ul>
          <div className="inline-add">
            <input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={onEnter(addItem)}
              placeholder={t('task.addItem')}
              maxLength={120}
              aria-label="New checklist item"
            />
            <button type="button" className="btn btn--outline" onClick={addItem} disabled={!newItem.trim()}>{t('board.add')}</button>
          </div>
        </div>

        </fieldset>

        {/* 📎 Attachments (udane save aagum) */}
        <div className="modal__section">
          <div className="modal__section-head">
            <span>{t('task.attachments')}</span>
            <small>{task.attachments.length}/5 · {t('task.attachHint')}</small>
          </div>
          {task.attachments.length > 0 && (
            <ul className="attachments">
              {task.attachments.map((a) => (
                <li key={a.id}>
                  {a.type.startsWith('image/') ? (
                    <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer" className="attachments__thumb">
                      <img src={`/api/attachments/${a.id}`} alt="" loading="lazy" />
                    </a>
                  ) : (
                    <span className="attachments__thumb" aria-hidden="true">{a.type === 'application/pdf' ? '📄' : '📝'}</span>
                  )}
                  <a className="attachments__name" href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer">{a.name}</a>
                  <small>{formatSize(a.size)}</small>
                  {onDeleteAttachment && !readOnly && (
                    <button type="button" className="icon-x" onClick={() => onDeleteAttachment(a.id).catch((err: Error) => setError(err.message))} aria-label={`${t('task.remove')} ${a.name}`}>×</button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {readOnly ? null : onUpload ? (
            task.attachments.length < 5 && (
              <label className={`btn btn--outline attach-btn ${uploading ? 'is-busy' : ''}`}>
                {uploading ? t('task.uploading') : t('task.attach')}
                <input type="file" accept={FILE_TYPES} className="sr-only" onChange={onFile} disabled={uploading} />
              </label>
            )
          ) : (
            <p className="modal__hint">{t('task.loginToAttach')}</p>
          )}
        </div>

        {/* 💬 Comments (udane save aagum) + 🆕 @mentions */}
        <div className="modal__section">
          <div className="modal__section-head">
            <span>{t('task.comments')}</span>
            <small>{task.comments.length}</small>
          </div>
          {task.comments.length > 0 && (
            <ul className="comments">
              {task.comments.map((c) => (
                <li key={c.id}>
                  <div className="comments__meta">
                    <strong>{c.author}</strong>
                    <small>{new Date(c.createdAt).toLocaleString()}</small>
                    {!readOnly && <button type="button" className="icon-x" onClick={() => onDeleteComment(c.id)} aria-label={t('task.deleteComment')}>×</button>}
                  </div>
                  <p>{withMentions(c.text)}</p>
                </li>
              ))}
            </ul>
          )}
          {!readOnly && (
          <div className="inline-add mention-box">
            <input
              ref={commentRef}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && suggestions.length) {
                  e.preventDefault();
                  pickMention(suggestions[0]); // Enter = mudhal suggestion
                } else onEnter(sendComment)(e);
              }}
              placeholder={people.length ? t('task.commentMention') : t('task.commentPlaceholder')}
              maxLength={500}
              aria-label="New comment"
              aria-autocomplete="list"
            />
            <button type="button" className="btn btn--outline" onClick={sendComment} disabled={!comment.trim()}>{t('task.post')}</button>
            {suggestions.length > 0 && (
              <ul className="mention-list" role="listbox" aria-label="People">
                {suggestions.map((p) => (
                  <li key={p.id}>
                    <button type="button" role="option" aria-selected="false" onMouseDown={(e) => e.preventDefault()} onClick={() => pickMention(p)}>
                      <span className="avatar avatar--xs" style={{ background: p.avatarColor }} aria-hidden="true">{p.name[0].toUpperCase()}</span>
                      {p.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          )}
        </div>

        {/* 🆕 🕓 History (click pannaa mattum load) */}
        {boardId && (
          <div className="modal__section">
            <button type="button" className="link-btn modal__history-toggle" onClick={() => setShowHistory((s) => !s)} aria-expanded={showHistory}>
              {t('task.history')} {showHistory ? '▴' : '▾'}
            </button>
            {showHistory && <ActivityFeed boardId={boardId} taskId={task.id} refreshKey={task.comments.length + task.attachments.length} />}
          </div>
        )}

        {error && <p className="modal__error">{error}</p>}

        <div className="modal__actions">
          <button type="button" className="btn btn--outline" onClick={onClose}>{t('board.cancel')}</button>
          {!readOnly && (
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? t('task.saving') : t('task.save')}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
