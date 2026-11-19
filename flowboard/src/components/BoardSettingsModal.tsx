import { useEffect, useState } from 'react';
import { api } from '../api.ts'; // 🆕 👥 members ku
import type { FormEvent } from 'react';
import { DEFAULT_LABELS, LABEL_COLORS } from '../types.ts';
import type { Board, Column, Label, Person } from '../types.ts';

const MAX_COLUMNS = 8; // server la irukkura athe limit
const MAX_LABELS = 12;

// 🆕 🎨 Board themes (server la irukkura athe ids; colours index.css la)
const THEMES = [
  { id: 'default', label: 'Classic' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'forest', label: 'Forest' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'berry', label: 'Berry' },
  { id: 'slate', label: 'Slate' },
];

// "Code Review" → "code-review-k3f9" (server ku seriyaana column id)
function makeColumnId(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20) || 'col';
  return `${slug}-${Math.random().toString(36).slice(2, 6)}`;
}

// ⚙️ Board settings popup: peru maathu, columns add / rename / move / delete, 🆕 members (share), board delete
// board = ippo irukkura board, canDelete = kadaisi board illana mattum true
// onMembersChange(count) = members maarinaa Demo ku sollu
export interface BoardChanges {
  name: string;
  columns: Column[];
  theme: string;
  labels: Label[]; // 🆕 🏷️
}
interface Members {
  owner: Person | null;
  members: Person[];
}
interface Props {
  board: Board;
  canDelete: boolean;
  onSave: (changes: BoardChanges) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
  onMembersChange?: (count: number) => void;
}

export default function BoardSettingsModal({ board, canDelete, onSave, onDelete, onClose, onMembersChange }: Props) {
  const [name, setName] = useState(board.name);
  const [columns, setColumns] = useState(board.columns.map((c) => ({ ...c })));
  const [theme, setTheme] = useState(board.theme ?? 'default'); // 🆕 🎨
  const [labels, setLabels] = useState<Label[]>((board.labels ?? DEFAULT_LABELS).map((l) => ({ ...l }))); // 🆕 🏷️
  const [newLabel, setNewLabel] = useState('');
  const [newColumn, setNewColumn] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [people, setPeople] = useState<Members | null>(null); // 🆕 👥 { owner, members }
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor'); // 🆕 👀 'editor' | 'viewer'
  const [memberError, setMemberError] = useState('');

  // 🆕 👥 Members list edu
  useEffect(() => {
    api(`/api/boards/${board.id}/members`)
      .then(setPeople)
      .catch(() => setMemberError("Couldn't load members."));
  }, [board.id]);

  // 🆕 👥➕ Invite (udane save aagum, "Save" button theva illa)
  const invite = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    setMemberError('');
    try {
      const data = await api(`/api/boards/${board.id}/members`, 'POST', { email, role: inviteRole });
      setPeople(data);
      setInviteEmail('');
      onMembersChange?.(data.members.length);
    } catch (err) {
      setMemberError((err as Error).message);
    }
  };

  // 🆕 👥➖ Remove
  const removeMember = async (member: Person) => {
    if (!window.confirm(`Remove ${member.name} from this board?`)) return;
    setMemberError('');
    try {
      const data = await api(`/api/boards/${board.id}/members/${member.id}`, 'DELETE');
      setPeople(data);
      onMembersChange?.(data.members.length);
    } catch (err) {
      setMemberError((err as Error).message);
    }
  };

  // 🆕 👀 Role maathu (udane save aagum)
  const changeRole = async (member: Person, role: string) => {
    setMemberError('');
    try {
      setPeople(await api(`/api/boards/${board.id}/members/${member.id}`, 'PATCH', { role }));
    } catch (err) {
      setMemberError((err as Error).message);
    }
  };

  // ⌨️ Esc = close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rename = (id: string, title: string) => setColumns((cs) => cs.map((c) => (c.id === id ? { ...c, title } : c)));
  const remove = (id: string) => setColumns((cs) => cs.filter((c) => c.id !== id));

  // ⬆️⬇️ Column ah idam maathu
  const move = (index: number, dir: number) =>
    setColumns((cs) => {
      const next = [...cs];
      const target = index + dir;
      if (target < 0 || target >= next.length) return cs;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const addColumn = () => {
    const title = newColumn.trim();
    if (!title || columns.length >= MAX_COLUMNS) return;
    setColumns((cs) => [...cs, { id: makeColumnId(title), title }]);
    setNewColumn('');
  };

  // 🏷️ Label add / rename / colour / delete
  const addLabel = () => {
    const labelName = newLabel.trim();
    if (!labelName || labels.length >= MAX_LABELS) return;
    const id = `${labelName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 16) || 'label'}-${Math.random().toString(36).slice(2, 6)}`;
    setLabels((ls) => [...ls, { id, name: labelName, color: LABEL_COLORS[ls.length % LABEL_COLORS.length] }]);
    setNewLabel('');
  };
  const changeLabel = (id: string, change: Partial<Label>) => setLabels((ls) => ls.map((l) => (l.id === id ? { ...l, ...change } : l)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Board name is required.');
    if (columns.length === 0) return setError('Keep at least one column.');
    if (columns.some((c) => !c.title.trim())) return setError('Every column needs a name.');
    if (labels.some((l) => !l.name.trim())) return setError('Every label needs a name.');

    // ⚠️ Azhicha columns la irukkura tasks mudhal column ku pogum nu sollu
    const removed = board.columns.filter((old) => !columns.some((c) => c.id === old.id));
    if (removed.length && !window.confirm(`Tasks in ${removed.map((c) => `"${c.title}"`).join(', ')} will move to "${columns[0].title}". Continue?`)) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      await onSave({ name: name.trim(), columns: columns.map((c) => ({ id: c.id, title: c.title.trim() })), theme, labels: labels.map((l) => ({ ...l, name: l.name.trim() })) });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${board.name}" and all its tasks? This can't be undone.`)) return;
    try {
      await onDelete();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="board-settings-title">
        <h3 id="board-settings-title">⚙️ Board settings</h3>

        <label>
          Board name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus />
        </label>

        {/* 🆕 🎨 Theme */}
        <fieldset className="modal__section theme-picker">
          <legend className="modal__section-head">
            <span>Theme</span>
          </legend>
          <div className="theme-picker__list">
            {THEMES.map((t) => (
              <label key={t.id} className={`theme-swatch board-theme--${t.id} ${theme === t.id ? 'is-on' : ''}`}>
                <input
                  type="radio"
                  name="board-theme"
                  value={t.id}
                  checked={theme === t.id}
                  onChange={() => setTheme(t.id)}
                  className="sr-only"
                />
                <span className="theme-swatch__preview" aria-hidden="true" />
                <small>{t.label}</small>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="modal__section">
          <div className="modal__section-head">
            <span>Columns</span>
            <small>{columns.length}/{MAX_COLUMNS}</small>
          </div>
          <ul className="column-editor">
            {columns.map((c, i) => (
              <li key={c.id}>
                <input
                  value={c.title}
                  onChange={(e) => rename(c.id, e.target.value)}
                  maxLength={30}
                  aria-label={`Column ${i + 1} name`}
                />
                <button type="button" className="icon-x" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move left">↑</button>
                <button type="button" className="icon-x" onClick={() => move(i, 1)} disabled={i === columns.length - 1} aria-label="Move right">↓</button>
                <button type="button" className="icon-x" onClick={() => remove(c.id)} disabled={columns.length === 1} aria-label={`Delete ${c.title}`}>×</button>
              </li>
            ))}
          </ul>
          {columns.length < MAX_COLUMNS && (
            <div className="inline-add">
              <input
                value={newColumn}
                onChange={(e) => setNewColumn(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addColumn();
                  }
                }}
                placeholder="New column, e.g. Review"
                maxLength={30}
                aria-label="New column name"
              />
              <button type="button" className="btn btn--outline" onClick={addColumn} disabled={!newColumn.trim()}>Add</button>
            </div>
          )}
        </div>

        {/* 🆕 🏷️ Labels */}
        <div className="modal__section">
          <div className="modal__section-head">
            <span>Labels</span>
            <small>{labels.length}/{MAX_LABELS}</small>
          </div>
          <ul className="label-editor">
            {labels.map((l) => (
              <li key={l.id}>
                <span className={`label label--c-${l.color}`}>{l.name.trim() || '…'}</span>
                <input value={l.name} onChange={(e) => changeLabel(l.id, { name: e.target.value })} maxLength={20} aria-label={`Label ${l.name} name`} />
                <select value={l.color} onChange={(e) => changeLabel(l.id, { color: e.target.value })} aria-label={`Label ${l.name} colour`}>
                  {LABEL_COLORS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <button type="button" className="icon-x" onClick={() => setLabels((ls) => ls.filter((x) => x.id !== l.id))} aria-label={`Delete label ${l.name}`}>×</button>
              </li>
            ))}
          </ul>
          {labels.length < MAX_LABELS && (
            <div className="inline-add">
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addLabel();
                  }
                }}
                placeholder="New label, e.g. Client A"
                maxLength={20}
                aria-label="New label name"
              />
              <button type="button" className="btn btn--outline" onClick={addLabel} disabled={!newLabel.trim()}>Add</button>
            </div>
          )}
        </div>

        {/* 🆕 📦 CSV download */}
        <a className="link-btn modal__csv" href={`/api/boards/${board.id}/export.csv`} download>
          ⬇️ Download this board as CSV (Excel / Google Sheets)
        </a>

        {/* 🆕 👥 Share: members */}
        <div className="modal__section">
          <div className="modal__section-head">
            <span>Shared with</span>
            {people && <small>{people.members.length}/10</small>}
          </div>
          {people && (
            <ul className="members">
              {people.owner && (
                <li>
                  <span className="avatar avatar--sm" style={{ background: people.owner.avatarColor }} aria-hidden="true">
                    {people.owner.name[0].toUpperCase()}
                  </span>
                  <span className="members__who">
                    <strong>{people.owner.name}</strong>
                    <small>{people.owner.email}</small>
                  </span>
                  <span className="members__role">Owner</span>
                </li>
              )}
              {people.members.map((m) => (
                <li key={m.id}>
                  <span className="avatar avatar--sm" style={{ background: m.avatarColor }} aria-hidden="true">
                    {m.name[0].toUpperCase()}
                  </span>
                  <span className="members__who">
                    <strong>{m.name}</strong>
                    <small>{m.email}</small>
                  </span>
                  <select className="members__select" value={m.role} onChange={(e) => changeRole(m, e.target.value)} aria-label={`${m.name} role`}>
                    <option value="editor">Can edit</option>
                    <option value="viewer">Can view</option>
                  </select>
                  <button type="button" className="icon-x" onClick={() => removeMember(m)} aria-label={`Remove ${m.name}`}>×</button>
                </li>
              ))}
            </ul>
          )}
          <div className="inline-add">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  invite();
                }
              }}
              placeholder="Friend's email (they need a Flowboard account)"
              aria-label="Invite by email"
            />
            <select className="members__select" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'editor' | 'viewer')} aria-label="Role for the invited person">
              <option value="editor">Can edit</option>
              <option value="viewer">Can view</option>
            </select>
            <button type="button" className="btn btn--outline" onClick={invite} disabled={!inviteEmail.trim()}>Invite</button>
          </div>
          {memberError && <p className="modal__error">{memberError}</p>}
        </div>

        {error && <p className="modal__error">{error}</p>}

        <div className="modal__actions modal__actions--split">
          {canDelete ? (
            <button type="button" className="btn btn--danger" onClick={handleDelete}>Delete board</button>
          ) : (
            <span />
          )}
          <div className="modal__actions">
            <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
