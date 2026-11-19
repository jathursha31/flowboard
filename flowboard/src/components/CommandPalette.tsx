import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

// ⌨️ Ctrl + K (Mac la ⌘ + K): ellaa boards, tasks, pages um ore idaththula thedi jump pannalaam
interface SearchResults {
  boards: { id: string; name: string }[];
  tasks: { id: string; title: string; boardId: string; boardName: string }[];
}
interface Item {
  group: string;
  label: string;
  hint?: string;
  run: () => void;
}

export default function CommandPalette({ onToggleTheme }: { onToggleTheme: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>({ boards: [], tasks: [] });
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌨️ Ctrl+K thira / moodu
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  // 🔍 Type pannadhum (konjam wait panni) server la thedu
  useEffect(() => {
    if (!open) return undefined;
    let ignore = false;
    const timer = setTimeout(() => {
      api<SearchResults>(`/api/search?q=${encodeURIComponent(query.trim())}`)
        .then((r) => !ignore && setResults(r))
        .catch(() => {});
    }, 150);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [open, query]);

  // 📋 Kaattura list: commands + boards + tasks
  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const commands = [
      { label: '🏠 Home', run: () => navigate('/') },
      { label: '📋 Open my board', run: () => navigate('/app') },
      ...(user ? [{ label: '👤 Account & stats', run: () => navigate('/account') }] : [{ label: '🔑 Log in / Sign up', run: () => navigate('/signin') }]),
      { label: '🌓 Toggle dark mode', run: onToggleTheme },
    ].filter((c) => !q || c.label.toLowerCase().includes(q));
    return [
      ...commands.map((c) => ({ ...c, group: 'Commands' })),
      ...results.boards.map((b) => ({ group: 'Boards', label: `📋 ${b.name}`, run: () => navigate(`/app?board=${b.id}`) })),
      ...results.tasks.map((t) => ({
        group: 'Tasks',
        label: t.title,
        hint: t.boardName,
        run: () => navigate(`/app?board=${t.boardId}&task=${t.id}`),
      })),
    ];
  }, [query, results, user, navigate, onToggleTheme]);

  useEffect(() => setActive(0), [items.length]);

  if (!open) return null;

  const choose = (item: Item | undefined) => {
    setOpen(false);
    item?.run();
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="modal-backdrop palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search everything">
        <input
          ref={inputRef}
          className="palette__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search tasks, boards or commands…"
          aria-label="Search"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={items[active] ? `palette-item-${active}` : undefined}
        />
        <ul className="palette__list" id="palette-list" role="listbox">
          {items.length === 0 && <li className="palette__empty">No results for “{query}”</li>}
          {items.map((item, i) => (
            <li key={`${item.group}-${i}`} role="presentation">
              {(i === 0 || items[i - 1].group !== item.group) && <div className="palette__group">{item.group}</div>}
              <button
                type="button"
                id={`palette-item-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? 'is-active' : ''}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(item)}
              >
                <span>{item.label}</span>
                {item.hint && <small>{item.hint}</small>}
              </button>
            </li>
          ))}
        </ul>
        <p className="palette__foot">↑↓ move · Enter open · Esc close</p>
      </div>
    </div>
  );
}
