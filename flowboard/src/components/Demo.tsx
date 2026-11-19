import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTouchDrag } from '../hooks/useTouchDrag.ts'; // 🆕 📱
import Icon from './Icon.tsx';
import Reveal from './Reveal.tsx';
import AuthBox from './AuthBox.tsx';
import type { CSSProperties, DragEvent, FormEvent } from 'react';
import { DEFAULT_LABELS } from '../types.ts';
import type { Board, Person, Priority, Task } from '../types.ts';
import type { DropTarget } from '../hooks/useTouchDrag.ts';
import type { TaskChanges } from './TaskModal.tsx';
import type { TimerAction } from './TaskTimer.tsx';
import { formatDuration } from '../utils/duration.ts';
import type { BoardChanges } from './BoardSettingsModal.tsx';
// ⚡ Popups / views ah open pannumbodhu mattum load (page vegamaa varum)
// 📴 Aana page load aana konja neram kazhichu background la download pannidurom: offline la um open aaganum
const loaders = {
  TaskModal: () => import('./TaskModal.tsx'), // ✏️ edit popup
  BoardSettingsModal: () => import('./BoardSettingsModal.tsx'), // ⚙️ board peru + columns
  CalendarView: () => import('./CalendarView.tsx'), // 📅
  AiPanel: () => import('./AiPanel.tsx'), // 🤖
  TimelineView: () => import('./TimelineView.tsx'), // 📊
  PlanDayPanel: () => import('./PlanDayPanel.tsx'), // 🌅
  ActivityFeed: () => import('./ActivityFeed.tsx'), // 🕓
  ChatPanel: () => import('./ChatPanel.tsx'), // 💬
  AssistantPanel: () => import('./AssistantPanel.tsx'), // 🤖
  TemplatePicker: () => import('./TemplatePicker.tsx'), // 🗂️
  ShortcutsHelp: () => import('./ShortcutsHelp.tsx'), // ⌨️
};
const TaskModal = lazy(loaders.TaskModal);
const BoardSettingsModal = lazy(loaders.BoardSettingsModal);
const CalendarView = lazy(loaders.CalendarView);
const AiPanel = lazy(loaders.AiPanel);
const TimelineView = lazy(loaders.TimelineView);
const PlanDayPanel = lazy(loaders.PlanDayPanel);
const ActivityFeed = lazy(loaders.ActivityFeed);
const ChatPanel = lazy(loaders.ChatPanel);
const AssistantPanel = lazy(loaders.AssistantPanel);
const TemplatePicker = lazy(loaders.TemplatePicker);
const ShortcutsHelp = lazy(loaders.ShortcutsHelp);
import { api, CLIENT_ID } from '../api.ts';
import { cacheGet, cacheSet, flushOutbox, isFlushing, isNetworkError, newTempId, onOutboxChange, outbox, sendOrQueue } from '../offline.ts'; // 🆕 📴
import { confetti } from '../confetti.ts'; // 🆕 🎉
import { trackEvent } from '../analytics.ts'; // 🆕 📊
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { useLang } from '../context/LanguageContext.tsx'; // 🆕 🌐 (home page heading ku)

const PRIORITIES: Priority[] = ['low', 'medium', 'high'];
const UNDO_MS = 5000; // 🆕 ↩️ delete pannina 5 second kulla Undo pannalaam

// 📅 Innaikku date "2026-10-22" format la (ungal computer time la)
function todayString() {
  return new Date().toLocaleDateString('en-CA');
}

// 📅 "2026-10-30" → "Oct 30"
function formatDate(date: string): string {
  return new Date(`${date}T00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// 🔴 Due date thaandiduchaa? (kadaisi "done" column la irundhaa late illa)
function isOverdue(task: Task, doneColumn: string | undefined): boolean {
  return Boolean(task.dueDate) && task.dueDate! < todayString() && task.column !== doneColumn;
}

// 🆕 ↕️ Column kulla varisai padi (order chinnadhu mudhalla)
function byOrder(a: Task, b: Task): number {
  return a.order - b.order;
}

// 🆕 Browser la "kadaisiya paatha board" nyabagam (try/catch: private mode la storage illaama irukkalaam)
function readSavedBoard(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function saveBoard(key: string, id: string): void {
  try {
    localStorage.setItem(key, id);
  } catch {
    /* ignore */
  }
}

// ⏳ Loading la irukkumbodhu kaattura grey "pòli" card
function SkeletonTask() {
  return (
    <li className="task task--skeleton" aria-hidden="true">
      <span className="skeleton skeleton--tag" />
      <span className="skeleton skeleton--line" />
      <span className="skeleton skeleton--line skeleton--short" />
    </li>
  );
}

// standalone = /app page la thani ah kaattumbodhu (home page la illa)
type View = 'board' | 'calendar' | 'timeline';
type PriorityFilter = 'all' | Priority;

export default function Demo({ standalone = false }: { standalone?: boolean }) {
  const { user, checking } = useAuth();
  const toast = useToast();
  const { t: tr } = useLang(); // 🌐 "tr": keezha card loop la "t" = task

  const [boards, setBoards] = useState<Board[]>([]); // 🆕 📋 ellaa boards
  const [boardId, setBoardId] = useState<string | null>(null); // 🆕 ippo paakkura board
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [filter, setFilter] = useState<PriorityFilter>('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View>('board'); // 🆕 'board' illa 'calendar'
  const [editingId, setEditingId] = useState<string | null>(null); // ✏️ edit panra task id
  const [settingsOpen, setSettingsOpen] = useState(false); // 🆕 ⚙️
  const [aiOpen, setAiOpen] = useState(false); // 🆕 🤖
  const [panel, setPanel] = useState<'plan' | 'activity' | 'chat' | 'assistant' | null>(null); // 🆕 'plan' 🌅 | 'activity' 🕓 | 'chat' 💬 | 'assistant' 🤖 | null
  const [chatTick, setChatTick] = useState(0); // 🆕 💬 pudhu chat message vandhaa
  const [chatUnread, setChatUnread] = useState(0); // 🆕 💬 chat moodi irukkumbodhu vandha messages
  const panelRef = useRef(panel);
  panelRef.current = panel;
  const [liveTick, setLiveTick] = useState(0); // 🆕 live update vandhaa activity ah thirumba edukka
  const [newBoardName, setNewBoardName] = useState(''); // 🆕 ➕ board
  const [addingBoard, setAddingBoard] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false); // 🆕 🗂️
  const [helpOpen, setHelpOpen] = useState(false); // 🆕 ⌨️
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null); // 🆕 ↕️ { column, beforeId } enga vizhum
  const [people, setPeople] = useState<Person[]>([]); // 🆕 👤 board la irukkuravanga (assign panna)
  const [live, setLive] = useState(false); // 🆕 ⚡ live connection on ah
  const [loadedBoardId, setLoadedBoardId] = useState<string | null>(null); // tasks endha board odadhu
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine)); // 🆕 📴
  const [waiting, setWaiting] = useState(() => outbox().length); // 🆕 📴 sync aaga kaathirukkura maatrangal
  const [searchParams, setSearchParams] = useSearchParams(); // 🆕 🔔 /app?board=..&task=.. (notification / Ctrl+K)
  const wantBoard = standalone ? searchParams.get('board') : null;
  const wantTask = standalone ? searchParams.get('task') : null;

  const addInputRef = useRef<HTMLInputElement>(null); // ⌨️ "N" shortcut ku
  const searchRef = useRef<HTMLInputElement>(null); // ⌨️ "/" shortcut ku
  const pendingDeletes = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; task: Task; boardId: string | null }>()); // 🆕 ↩️ Undo kaathirukkura deletes
  const boardIdRef = useRef<string | null>(null);
  boardIdRef.current = boardId;

  const storageKey = `flowboard-board-${user?.email ?? 'public'}`;
  const board = boards.find((b) => b.id === boardId) ?? null;
  const labelById = useMemo(() => new Map((board?.labels ?? DEFAULT_LABELS).map((l) => [l.id, l])), [board]); // 🏷️
  const columns = board?.columns ?? [];
  const doneColumn = columns[columns.length - 1]?.id; // kadaisi column = "done"
  const editingTask = tasks.find((t) => t.id === editingId) ?? null;

  // 🆕 📋 "Yaar login" check mudinjadhum boards edu. Login / logout aanaa thirumba edu
  useEffect(() => {
    if (checking) return;
    let ignore = false;
    api('/api/boards')
      .then((list) => {
        if (ignore) return;
        cacheSet(`boards-${storageKey}`, list); // 📴 offline ku
        setBoards(list);
        const saved = readSavedBoard(storageKey);
        setBoardId(list.some((b: Board) => b.id === saved) ? saved : list[0]?.id ?? null);
      })
      .catch((err) => {
        if (ignore) return;
        const cachedList = isNetworkError(err) && cacheGet(`boards-${storageKey}`); // 📴 net illana kadaisiya paathadhu
        if (cachedList) {
          setBoards(cachedList);
          const saved = readSavedBoard(storageKey);
          setBoardId(cachedList.some((b: Board) => b.id === saved) ? saved : cachedList[0]?.id ?? null);
        } else setError('Server ku connect panna mudiyala');
      });
    return () => {
      ignore = true;
    };
  }, [checking, storageKey]);

  // 👀 Board maarinaa antha board oda tasks edu
  useEffect(() => {
    if (!boardId) return;
    let ignore = false; // vegamaa board maathinaa pazhaya badhil ah thalli vidu
    setLoading(true);
    saveBoard(storageKey, boardId);
    api(`/api/tasks?boardId=${boardId}`)
      .then((data) => {
        if (ignore) return;
        cacheSet(`tasks-${boardId}`, data); // 📴
        setTasks(data);
        setLoadedBoardId(boardId);
        setError('');
      })
      .catch((err) => {
        if (ignore) return;
        const cachedTasks = isNetworkError(err) && cacheGet(`tasks-${boardId}`);
        if (cachedTasks) {
          setTasks(cachedTasks);
          setLoadedBoardId(boardId);
        } else setError('Server ku connect panna mudiyala');
      })
      .finally(() => !ignore && setLoading(false));
    return () => {
      ignore = true;
    };
  }, [boardId, storageKey]);

  // 🆕 🔄 Server la irunthu tasks ah thirumba edu (Undo kaathirukkura deletes ah kaattaadhe)
  const refreshTasks = async () => {
    const id = boardIdRef.current;
    const data = await api(`/api/tasks?boardId=${id}`);
    if (id === boardIdRef.current) setTasks(data.filter((t: Task) => !pendingDeletes.current.has(t.id)));
  };

  // 📴 Popups ah munnaadiye download (net poanaalum task popup thirakkanum)
  useEffect(() => {
    const timer = setTimeout(() => Object.values(loaders).forEach((load) => load().catch(() => {})), 300);
    return () => clearTimeout(timer);
  }, []);

  // 🆕 📴 Online / offline: net vandhadhum outbox ah anuppi, server la irunthu fresh ah edu
  useEffect(() => onOutboxChange(setWaiting), []);
  useEffect(() => {
    const sync = async () => {
      setOnline(true);
      if (!outbox().length) return;
      if (!outbox().length || isFlushing()) return; // innoru sync already nadakkudhu: adhuve message kaattum
      const { synced, dropped } = await flushOutbox();
      if (synced || dropped) {
        await refreshTasks().catch(() => {});
        toast(tr('offline.synced', { n: synced }));
      }
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', sync);
    window.addEventListener('offline', goOffline);
    if (navigator.onLine && outbox().length) sync(); // pazhaya session la kaathirundhadhu
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', goOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 📴 Screen la irukkura tasks ah cache la um vai (offline la thirandhaal kaattalaam)
  useEffect(() => {
    if (loadedBoardId && loadedBoardId === boardId) cacheSet(`tasks-${boardId}`, tasks);
  }, [tasks, boardId, loadedBoardId]);

  // 🆕 ⚡ LIVE: friend (illa vera tab) intha board la maathinaa, ungal screen um udane maarum
  useEffect(() => {
    if (!boardId || typeof EventSource === 'undefined') return undefined;
    const source = new EventSource(`/api/boards/${boardId}/events`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false); // browser thaane thirumba connect pannum
    source.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.by === CLIENT_ID) return; // naan thaan maathinen, already screen la irukku
      if (msg.type === 'chat') {
        // 💬 tasks thirumba edukka vendaam: chat mattum
        setChatTick((n) => n + 1);
        if (panelRef.current !== 'chat') setChatUnread((n) => n + 1);
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          if (msg.type === 'board') {
            const list = await api('/api/boards');
            setBoards(list);
            if (!list.some((b: Board) => b.id === boardIdRef.current)) {
              toast('You no longer have access to that board', 'error');
              setBoardId(list[0]?.id ?? null);
              return;
            }
          }
          await refreshTasks();
          setLiveTick((n) => n + 1);
        } catch {
          /* adutha update la sari aagum */
        }
      }, 300); // pala maatram ore neraththula vandhaa oru thadavai mattum edu
    };
    setChatUnread(0);
    return () => {
      clearTimeout(timer);
      source.close();
      setLive(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  // 🆕 👤 Share panna board na, yaar yaar irukkaanga nu edu (assign dropdown + card avatar ku)
  const shared = Boolean(board && (board.memberCount > 0 || board.role === 'member'));
  useEffect(() => {
    if (!user || !shared) {
      setPeople([]);
      return undefined;
    }
    let ignore = false;
    api(`/api/boards/${boardId}/members`)
      .then((d) => !ignore && setPeople([d.owner, ...d.members].filter(Boolean)))
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [user, shared, boardId, board?.memberCount]);

  // 🆕 🔔 /app?board=X&task=Y: andha board ku po, task popup ah thira
  useEffect(() => {
    if (!wantBoard || !boards.length) return;
    if (boards.some((b) => b.id === wantBoard)) setBoardId(wantBoard);
    else {
      toast("That board isn't available", 'error');
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantBoard, boards.length]);

  useEffect(() => {
    if (!wantBoard || loadedBoardId !== wantBoard) return;
    if (wantTask && tasks.some((t) => t.id === wantTask)) setEditingId(wantTask);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantBoard, wantTask, loadedBoardId]);

  // 🆕 ↩️ Page vittu poradhukku munnaadi, kaathirukkura deletes ah server ku anuppidu
  useEffect(() => {
    const pending = pendingDeletes.current;
    const flush = () => {
      for (const [id, p] of pending) {
        clearTimeout(p.timer);
        fetch(`/api/tasks/${id}`, { method: 'DELETE', keepalive: true }).catch(() => {});
      }
      pending.clear();
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  // 🆕 ⌨️ Keyboard shortcuts (/app page la mattum)
  useEffect(() => {
    if (!standalone) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable) return; // type pannumbodhu illa
      if (document.querySelector('.modal-backdrop')) return; // popup open la illa
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const togglePanel = (p: 'plan' | 'activity' | 'chat' | 'assistant') => setPanel((cur) => (cur === p ? null : p));
      if (key === 'Escape') setPanel(null);
      else if (key === 'b') setView('board');
      else if (key === 't') setView((v) => (v === 'timeline' ? 'board' : 'timeline'));
      else if (key === 'a' && user) togglePanel('assistant');
      else if (key === 'm' && user) togglePanel('chat');
      else if (key === 'h') togglePanel('activity');
      else if (key === 'p' && user) togglePanel('plan');
      else if (key === 'n') {
        e.preventDefault();
        setView('board');
        setTimeout(() => addInputRef.current?.focus(), 0);
      } else if (key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (key === 'c') {
        setView((v) => (v === 'calendar' ? 'board' : 'calendar'));
      } else if (key === '?') {
        setHelpOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [standalone, user]);

  // 🔍 Priority filter + search rendum serthu
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter(
      (t) =>
        (filter === 'all' || t.priority === filter) &&
        (!q ||
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.labels.some((l) => (labelById.get(l)?.name ?? l).toLowerCase().includes(q)) ||
          t.checklist.some((i) => i.text.toLowerCase().includes(q)))
    );
  }, [tasks, filter, search]);

  const doneCount = tasks.filter((t) => t.column === doneColumn).length;
  const percent = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

  // ➕ CREATE
  const addTask = async (e: FormEvent) => {
    e.preventDefault();
    const text = title.trim();
    if (!text || !boardId) return;
    try {
      const tempId = newTempId();
      const { data, queued } = await sendOrQueue('/api/tasks', 'POST', { title: text, priority, boardId }, { tempId });
      trackEvent('task_created'); // 📊
      // 📴 net illana screen la udane (temporary id oda), net vandhadhum server la save aagum
      const task = data ?? { id: tempId, title: text, priority, column: columns[0]?.id, order: Date.now(), description: '', dueDate: null, labels: [], checklist: [], comments: [], attachments: [], repeat: null, assigneeId: null };
      setTasks((ts) => [...ts, task]);
      setTitle('');
      toast(queued ? tr('offline.savedOffline') : tr('board.taskAdded'));
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  // 🆕 ↕️ Task ah oru column la, oru task ku munnaadi (illa kadaisila) vai, varisai ah server la save
  const placeTask = (id: string, column: string, beforeId: string | null = null) => {
    const moving = tasks.find((t) => t.id === id);
    if (!moving) return;
    const others = tasks.filter((t) => t.column === column && t.id !== id).sort(byOrder);
    const at = beforeId ? others.findIndex((t) => t.id === beforeId) : -1;
    const ordered = at === -1 ? [...others, moving] : [...others.slice(0, at), moving, ...others.slice(at)];
    const ids = ordered.map((t) => t.id);

    // ⚡ Screen la udane, server ku pinnaadi (optimistic update)
    setTasks((ts) =>
      ts.map((t) => {
        const i = ids.indexOf(t.id);
        return i === -1 ? t : { ...t, column, order: i };
      })
    );
    sendOrQueue('/api/tasks/reorder', 'POST', { boardId, column, ids, movedId: id }) // 📴 net illana outbox
      .then(({ data }) => data?.repeated && refreshTasks().then(() => toast(tr('board.repeatReady'))))
      .catch(() => toast("Couldn't save the move", 'error'));
    if (column === doneColumn && moving.column !== doneColumn) celebrate(column); // 🆕 🎉
  };

  // 🆕 🎉 Done column mele irunthu confetti
  const celebrate = (column: string) => {
    const box = document.querySelector(`[data-column="${column}"]`)?.getBoundingClientRect();
    confetti(box ? { x: box.left + box.width / 2, y: box.top + 40 } : undefined);
  };

  // 📱 Arrows (mobile): pakkathu column ku, kadaisila
  const shiftTask = (id: string, dir: number) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    const idx = columns.findIndex((c) => c.id === task.column) + dir;
    if (idx >= 0 && idx < columns.length) placeTask(id, columns[idx].id);
  };

  // 💾 Edit popup "Save"
  const saveTask = async (changes: TaskChanges) => {
    const before = tasks.find((t) => t.id === editingId);
    const { data, queued } = await sendOrQueue(`/api/tasks/${editingId}`, 'PATCH', changes);
    const updated = data ?? { ...before, ...changes }; // 📴 offline: screen la mattum ippo, server ku apram
    setTasks((ts) => ts.map((t) => (t.id === updated.id ? updated : t)));
    if (updated.column === doneColumn && before?.column !== doneColumn) {
      celebrate(updated.column); // 🆕 🎉
      if (before?.repeat) refreshTasks().then(() => toast(tr('board.repeatReady'))); // 🆕 🔁
    }
    setEditingId(null);
    toast(queued ? tr('offline.savedOffline') : tr('board.taskSaved'));
  };

  // 🆕 💬 Comments (popup open la irukkumbodhe task update aagum)
  const replaceTask = (updated: Task) => setTasks((ts) => ts.map((t) => (t.id === updated.id ? updated : t)));
  const addComment = async (text: string) => replaceTask(await api(`/api/tasks/${editingId}/comments`, 'POST', { text }));
  // 🆕 📎 File upload: body = file apdiye, peru header la
  const uploadAttachment = async (file: File) => {
    const res = await fetch(`/api/tasks/${editingId}/attachments`, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name), 'X-Client-Id': CLIENT_ID },
      body: file,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    replaceTask(data);
    toast(`Attached "${file.name}"`);
  };
  const deleteAttachment = async (fileId: string) => replaceTask(await api(`/api/tasks/${editingId}/attachments/${fileId}`, 'DELETE'));

  // 🆕 🔗 Links (error ah TaskLinks box kaattum)
  const addLink = async (url: string) => replaceTask(await api(`/api/tasks/${editingId}/links`, 'POST', { url }));
  const deleteLink = async (linkId: string) => replaceTask(await api(`/api/tasks/${editingId}/links/${linkId}`, 'DELETE'));

  // 🆕 ⏱️ Timer: start pannaa en mattha timer nikkum, adhanaala tasks ah thirumba edu
  const timerTask = async (action: TimerAction) => {
    try {
      replaceTask(await api(`/api/tasks/${editingId}/timer`, 'POST', { action }));
      if (action === 'start') await refreshTasks();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const deleteComment = async (commentId: string) => {
    try {
      replaceTask(await api(`/api/tasks/${editingId}/comments/${commentId}`, 'DELETE'));
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  // 🆕 ↩️ Undo: delete ah cancel panni task ah thirumba kondu vaa
  const undoDelete = (id: string) => {
    const p = pendingDeletes.current.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    pendingDeletes.current.delete(id);
    if (p.boardId === boardIdRef.current) setTasks((ts) => [...ts, p.task]); // vera board la irundhaa, DB la irukkattum
    toast(tr('board.restored'));
  };

  // 🗑️ DELETE: screen la udane maraiyum, 5 second apram dhaan server la azhiyum (Undo ku time)
  const deleteTask = (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    setTasks((ts) => ts.filter((t) => t.id !== id));
    const timer = setTimeout(() => {
      pendingDeletes.current.delete(id);
      sendOrQueue(`/api/tasks/${id}`, 'DELETE').catch(() => toast("Couldn't delete the task", 'error')); // 📴
    }, UNDO_MS);
    pendingDeletes.current.set(id, { timer, task, boardId });
    toast(tr('board.deleted', { title: task.title }), 'success', {
      duration: UNDO_MS,
      action: { label: tr('board.undo'), onClick: () => undoDelete(id) },
    });
  };

  // 🔄 RESET: intha board mattum
  const resetBoard = async () => {
    try {
      const data = await api('/api/tasks/reset', 'POST', { boardId });
      setTasks(data.tasks);
      setBoards((bs) => bs.map((b) => (b.id === data.board.id ? data.board : b)));
      toast('Board reset');
    } catch {
      toast("Couldn't reset the board", 'error');
    }
  };

  // 🆕 📋 Pudhu board
  const createBoard = async (e: FormEvent) => {
    e.preventDefault();
    const name = newBoardName.trim();
    if (!name) return;
    try {
      const created = await api('/api/boards', 'POST', { name });
      setBoards((bs) => [...bs, created]);
      setBoardId(created.id);
      setNewBoardName('');
      setAddingBoard(false);
      toast(`Board "${created.name}" created`);
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  // 🆕 ⚙️ Board settings save (columns maarinaa tasks ah thirumba edu: azhicha column tasks move aagirukkum)
  const saveBoardSettings = async (changes: BoardChanges) => {
    const updated = await api(`/api/boards/${boardId}`, 'PATCH', changes);
    setBoards((bs) => bs.map((b) => (b.id === updated.id ? updated : b)));
    setSettingsOpen(false);
    const data = await api(`/api/tasks?boardId=${boardId}`);
    setTasks(data);
    toast('Board updated');
  };

  const deleteBoard = async () => {
    await api(`/api/boards/${boardId}`, 'DELETE');
    const rest = boards.filter((b) => b.id !== boardId);
    setBoards(rest);
    setBoardId(rest[0]?.id ?? null);
    setSettingsOpen(false);
    toast('Board deleted');
  };

  // 🆕 👥 Share panna board ah vittu poga (member mattum)
  const leaveBoard = async () => {
    if (!board || !window.confirm(`Leave "${board.name}"? You'll lose access until ${board.ownerName} invites you again.`)) return;
    try {
      await api(`/api/boards/${boardId}/members/me`, 'DELETE');
      const rest = boards.filter((b) => b.id !== boardId);
      setBoards(rest);
      setBoardId(rest[0]?.id ?? null);
      toast(`You left "${board.name}"`);
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  // 🆕 👥 Settings la members maarinaa count update
  const onMembersChange = (count: number) =>
    setBoards((bs) => bs.map((b) => (b.id === boardId ? { ...b, memberCount: count } : b)));

  const isOwner = board?.role === 'owner';
  const canEdit = board?.access !== 'viewer'; // 🆕 👀 viewer = paakka mattum

  // 🤖 AI tasks add aanadhum
  const onAiAdded = (created: Task[]) => {
    setTasks((ts) => [...ts, ...created]);
    toast(`Added ${created.length} AI task${created.length === 1 ? '' : 's'}`);
  };

  // 🆕 ↕️ Drag & drop
  const onCardDragOver = (e: DragEvent<HTMLElement>, column: string, items: Task[], index: number) => {
    e.preventDefault();
    e.stopPropagation(); // column handler ku pogaadhe
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2; // card oda keezh paadhi = adhukku apram
    const beforeId = after ? items[index + 1]?.id ?? null : items[index].id;
    setDrop((d) => (d?.column === column && d?.beforeId === beforeId ? d : { column, beforeId }));
  };

  const onColumnDrop = () => {
    if (dragId && drop) placeTask(dragId, drop.column, drop.beforeId === dragId ? null : drop.beforeId);
    setDragId(null);
    setDrop(null);
  };

  // 🆕 📱 Phone: card ah amukki pidichu drag
  const startTouch = useTouchDrag({
    onStart: (id) => setDragId(id),
    onOver: (d) => setDrop((cur) => (cur?.column === d.column && cur?.beforeId === d.beforeId ? cur : d)),
    onDrop: onColumnDrop,
    onCancel: () => {
      setDragId(null);
      setDrop(null);
    },
  });

  const personOf = (id: string | null) => people.find((p) => p.id === id); // 🆕 👤

  return (
    <section className="section section--alt" id={standalone ? undefined : 'demo'}>
      <div className="container">
        <Reveal className="section__head">
          <span className="eyebrow">{standalone ? tr('board.workspace') : tr('demo.eyebrow')}</span>
          <h2>{standalone ? (user ? tr('board.workspaceOf', { name: user.name.split(' ')[0] }) : tr('board.demoBoard')) : tr('demo.title')}</h2>
          <p>
            {standalone
              ? tr('board.subtitle')
              : tr('demo.subtitle')}
          </p>
        </Reveal>

        <Reveal className={`board-wrap board-theme--${board?.theme ?? 'default'}`}>
          {/* 👤 Login / Sign up box */}
          <AuthBox />

          {/* 🆕 📋 Board bar: board choose, pudhu board, settings, view, AI */}
          <div className="board-bar">
            <label className="sr-only" htmlFor="board-select">{tr('board.boardLabel')}</label>
            <select id="board-select" value={boardId ?? ''} onChange={(e) => setBoardId(e.target.value)}>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.role === 'member' ? `👥 ${b.name} (${b.ownerName})` : `${b.memberCount ? '👥' : '📋'} ${b.name}`}
                </option>
              ))}
            </select>

            {user && !addingBoard && (
              <>
                <button type="button" className="chip" onClick={() => setAddingBoard(true)}>{tr('board.newBoard')}</button>
                <button type="button" className="chip" onClick={() => setTemplatesOpen(true)}>{tr('templates.button')}</button>
              </>
            )}
            {user && addingBoard && (
              <form className="board-bar__new" onSubmit={createBoard}>
                <input
                  value={newBoardName}
                  onChange={(e) => setNewBoardName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setAddingBoard(false)}
                  placeholder={tr('board.boardName')}
                  maxLength={40}
                  aria-label="New board name"
                  autoFocus
                />
                <button type="submit" className="btn btn--primary" disabled={!newBoardName.trim()}>{tr('board.create')}</button>
                <button type="button" className="chip" onClick={() => setAddingBoard(false)}>{tr('board.cancel')}</button>
              </form>
            )}
            {user && board && isOwner && (
              <button type="button" className="chip" onClick={() => setSettingsOpen(true)}>
                {tr('board.settings')}{board.memberCount ? ` (${board.memberCount + 1})` : ''}
              </button>
            )}
            {/* 🆕 👥 Friend share panna board: yaar board + Leave */}
            {user && board && !isOwner && (
              <>
                <span className="shared-badge">{tr('board.sharedBy', { name: board.ownerName ?? '' })}</span>
                <button type="button" className="chip" onClick={leaveBoard}>{tr('board.leave')}</button>
              </>
            )}
            {!canEdit && <span className="view-only-badge">{tr('board.viewOnly')}</span>}
            {/* 🆕 ⚡ Share panna board la live connection irundhaa */}
            {live && shared && (
              <span className="live-dot" title={tr('board.liveTitle')}>{tr('board.live')}</span>
            )}

            <div className="board-bar__right">
              <div className="segmented" role="group" aria-label={tr('board.view')}>
                {(['board', 'calendar', 'timeline'] as const).map((v) => (
                  <button key={v} type="button" className={view === v ? 'is-active' : ''} aria-pressed={view === v} onClick={() => setView(v)}>
                    {tr(`board.view${v[0].toUpperCase()}${v.slice(1)}`)}
                  </button>
                ))}
              </div>
              {canEdit && <button
                type="button"
                className={`chip chip--ai ${aiOpen ? 'is-active' : ''}`}
                onClick={() => (user ? setAiOpen((o) => !o) : toast(tr('board.loginForAi'), 'error'))}
              >
                {tr('board.aiTasks')}
              </button>}
              {/* 🆕 🌅 + 🕓 */}
              {user && standalone && (
                <button type="button" className={`chip chip--ai ${panel === 'plan' ? 'is-active' : ''}`} onClick={() => setPanel((p) => (p === 'plan' ? null : 'plan'))}>
                  {tr('board.planDay')}
                </button>
              )}
              {board && (
                <button type="button" className={`chip ${panel === 'activity' ? 'is-active' : ''}`} onClick={() => setPanel((p) => (p === 'activity' ? null : 'activity'))}>
                  {tr('board.activity')}
                </button>
              )}
              {/* 🆕 🤖 AI assistant */}
              {user && standalone && (
                <button type="button" className={`chip chip--ai ${panel === 'assistant' ? 'is-active' : ''}`} onClick={() => setPanel((p) => (p === 'assistant' ? null : 'assistant'))}>
                  {tr('assistant.button')}
                </button>
              )}
              {/* 🆕 💬 Team chat */}
              {user && standalone && board && (
                <button
                  type="button"
                  className={`chip ${panel === 'chat' ? 'is-active' : ''}`}
                  onClick={() => {
                    setChatUnread(0);
                    setPanel((p) => (p === 'chat' ? null : 'chat'));
                  }}
                >
                  {tr('chat.button')}
                  {chatUnread > 0 && panel !== 'chat' && <span className="chip__badge" aria-label={`${chatUnread} new`}>{chatUnread > 9 ? '9+' : chatUnread}</span>}
                </button>
              )}
            </div>
          </div>

          {/* 🆕 🌅 Plan my day / 🕓 Activity panels */}
          {panel === 'plan' && user && (
            <Suspense fallback={null}>
              <PlanDayPanel
                onClose={() => setPanel(null)}
                onOpenTask={(task) => {
                  setPanel(null);
                  if (task.boardId === boardId) setEditingId(task.id);
                  else setSearchParams({ board: task.boardId, task: task.id });
                }}
              />
            </Suspense>
          )}
          {panel === 'activity' && board && (
            <section className="activity-panel" aria-label={tr('board.activityTitle')}>
              <div className="plan-day__head">
                <h3>{tr('board.activityTitle')}</h3>
                <button type="button" className="icon-x" onClick={() => setPanel(null)} aria-label={tr('plan.close')}>×</button>
              </div>
              <Suspense fallback={null}>
                <ActivityFeed boardId={boardId!} refreshKey={liveTick + tasks.length} onOpenTask={(id) => tasks.some((x) => x.id === id) && setEditingId(id)} />
              </Suspense>
            </section>
          )}

          {helpOpen && (
            <Suspense fallback={null}>
              <ShortcutsHelp onClose={() => setHelpOpen(false)} />
            </Suspense>
          )}

          {templatesOpen && user && (
            <Suspense fallback={null}>
              <TemplatePicker
                onClose={() => setTemplatesOpen(false)}
                onCreated={(created) => {
                  setBoards((bs) => [...bs, created]);
                  setBoardId(created.id);
                  setTemplatesOpen(false);
                }}
              />
            </Suspense>
          )}

          {panel === 'assistant' && user && (
            <Suspense fallback={null}>
              <AssistantPanel
                onClose={() => setPanel(null)}
                onOpenTask={(task) => {
                  if (task.boardId === boardId) setEditingId(task.id);
                  else setSearchParams({ board: task.boardId, task: task.id });
                }}
              />
            </Suspense>
          )}

          {panel === 'chat' && user && board && (
            <Suspense fallback={null}>
              <ChatPanel key={board.id} boardId={board.id} refreshKey={chatTick} onClose={() => setPanel(null)} />
            </Suspense>
          )}

          {/* 🆕 🤖 AI panel */}
          {aiOpen && user && boardId && (
            <Suspense fallback={null}>
              <AiPanel boardId={boardId} onAdded={onAiAdded} onClose={() => setAiOpen(false)} />
            </Suspense>
          )}

          <div className="board-toolbar">
            {canEdit && <form className="add-form" onSubmit={addTask}>
              <label className="sr-only" htmlFor="task-title">{tr('board.newTask')}</label>
              <input
                ref={addInputRef}
                id="task-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={tr('board.addPlaceholder')}
                maxLength={80}
              />
              <label className="sr-only" htmlFor="task-priority">{tr('board.priority')}</label>
              <select id="task-priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{tr(`board.${p}`)}</option>
                ))}
              </select>
              <button className="btn btn--primary" type="submit" disabled={!title.trim()}>
                <Icon name="plus" size={18} /> {tr('board.add')}
              </button>
            </form>}

            <div className="filters" role="group" aria-label={tr('board.filterBy')}>
              {(['all', ...PRIORITIES] as PriorityFilter[]).map((p) => (
                <button
                  key={p}
                  className={`chip ${filter === p ? 'is-active' : ''}`}
                  onClick={() => setFilter(p)}
                  aria-pressed={filter === p}
                >
                  {tr(`board.${p}`)}
                </button>
              ))}
            </div>
          </div>

          {/* 🔍 Task search */}
          <input
            ref={searchRef}
            className="board-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr('board.searchPlaceholder')}
            aria-label={tr('board.search')}
          />

          {/* 🆕 📴 Offline / sync status */}
          {(!online || waiting > 0) && (
            <p className={`offline-bar ${online ? 'is-syncing' : ''}`} role="status">
              {online ? tr('offline.syncing', { n: waiting }) : tr('offline.offline', { n: waiting })}
            </p>
          )}

          {standalone && (
            <p className="shortcut-hint">
              <button type="button" className="link-btn" onClick={() => setHelpOpen(true)}>{tr('board.shortcuts')}</button>
            </p>
          )}

          {loading && <p className="sr-only">Loading tasks…</p>}
          {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

          <div className="progress">
            <div className="progress__label">
              <span>{tr('board.progress')}</span>
              <strong>{percent}%</strong>
            </div>
            <div className="progress__track">
              <div className="progress__fill" style={{ width: `${percent}%` }} />
            </div>
          </div>

          {/* 🆕 📅 Calendar view */}
          {view === 'calendar' && !loading && (
            <Suspense fallback={<p className="muted">{tr('board.loadingCalendar')}</p>}>
              <CalendarView tasks={visible} doneColumn={doneColumn} onOpen={(t) => setEditingId(t.id)} />
            </Suspense>
          )}

          {/* 🆕 📊 Timeline view */}
          {view === 'timeline' && !loading && (
            <Suspense fallback={<p className="muted">{tr('board.loadingCalendar')}</p>}>
              <TimelineView tasks={visible} doneColumn={doneColumn} onOpen={(t) => setEditingId(t.id)} />
            </Suspense>
          )}

          {view === 'board' && (
            <div className="board" style={{ '--cols': Math.max(columns.length, 1) } as CSSProperties}>
              {(columns.length ? columns : [{ id: '_', title: 'Loading' }]).map((col, colIdx) => {
                const items = visible.filter((t) => t.column === col.id).sort(byOrder);
                const dropAtEnd = drop?.column === col.id && drop.beforeId === null;
                return (
                  <div
                    key={col.id}
                    data-column={col.id}
                    className={`column ${dropAtEnd ? 'is-over' : ''}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (!(drop?.column === col.id && drop.beforeId === null)) setDrop({ column: col.id, beforeId: null });
                    }}
                    onDrop={onColumnDrop}
                  >
                    <div className="column__head">
                      <span className={`column__dot column__dot--${colIdx === columns.length - 1 ? 'done' : colIdx === 0 ? 'todo' : 'doing'}`} />
                      <h3>{col.title}</h3>
                      <span className="column__count">{loading ? '–' : items.length}</span>
                    </div>

                    <ul className="column__list">
                      {loading && (
                        <>
                          <SkeletonTask />
                          <SkeletonTask />
                        </>
                      )}

                      {!loading &&
                        items.map((t, i) => {
                          const doneItems = t.checklist.filter((c) => c.done).length;
                          const dropBefore = drop?.column === col.id && drop.beforeId === t.id && dragId !== t.id;
                          return (
                            <li
                              key={t.id}
                              data-task-id={t.id}
                              className={`task ${dragId === t.id ? 'is-dragging' : ''} ${dropBefore ? 'is-drop-before' : ''}`}
                              onTouchStart={canEdit ? startTouch(t.id, t.title) : undefined}
                              draggable={canEdit}
                              onDragStart={() => setDragId(t.id)}
                              onDragOver={(e) => onCardDragOver(e, col.id, items, i)}
                              onDragEnd={() => {
                                setDragId(null);
                                setDrop(null);
                              }}
                            >
                              <div className="task__top">
                                <span className={`tag tag--${t.priority}`}>{tr(`board.${t.priority}`)}</span>
                                {canEdit && <button className="task__del" onClick={() => deleteTask(t.id)} aria-label={tr('board.deleteTask', { title: t.title })}>
                                  <Icon name="trash" size={15} />
                                </button>}
                              </div>

                              {/* Title click pannaa edit popup */}
                              <button
                                type="button"
                                className={`task__title ${t.column === doneColumn ? 'is-done' : ''}`}
                                onClick={() => setEditingId(t.id)}
                              >
                                {t.title}
                              </button>

                              {/* Labels + checklist + comments + description + due date */}
                              {(t.labels.length > 0 || t.description || t.dueDate || t.checklist.length > 0 || t.comments.length > 0 || t.repeat || t.attachments.length > 0 || personOf(t.assigneeId) || t.timerStartedAt || (t.timeSpent ?? 0) > 0 || (t.links?.length ?? 0) > 0) && (
                                <div className="task__meta">
                                  {/* 🆕 👤 Assign aanavar */}
                                  {personOf(t.assigneeId) && (
                                    <span
                                      className="avatar avatar--xs"
                                      style={{ background: personOf(t.assigneeId)!.avatarColor }}
                                      title={`Assigned to ${personOf(t.assigneeId)!.name}`}
                                    >
                                      {personOf(t.assigneeId)!.name[0].toUpperCase()}
                                    </span>
                                  )}
                                  {t.repeat && <span className="task__count" title={`Repeats ${t.repeat}`}>🔁</span>}
                                  {(t.links?.length ?? 0) > 0 && <span className="task__count" title={tr('links.title')}>🔗 {t.links!.length}</span>}
                                  {t.timerStartedAt ? (
                                    <span className="task__count task__count--live" title={tr('timer.running')}>⏱️ ●</span>
                                  ) : (t.timeSpent ?? 0) > 0 ? (
                                    <span className="task__count" title={tr('timer.title')}>⏱️ {formatDuration(t.timeSpent ?? 0)}</span>
                                  ) : null}
                                  {t.labels.map((l) => {
                                    const label = labelById.get(l); // 🏷️ board la illaadha label ah kaattaadhe
                                    return label && <span key={l} className={`label label--c-${label.color}`}>{label.name}</span>;
                                  })}
                                  {t.checklist.length > 0 && (
                                    <span className={`task__count ${doneItems === t.checklist.length ? 'is-complete' : ''}`} title="Checklist">
                                      ☑ {doneItems}/{t.checklist.length}
                                    </span>
                                  )}
                                  {t.comments.length > 0 && (
                                    <span className="task__count" title="Comments">💬 {t.comments.length}</span>
                                  )}
                                  {t.attachments.length > 0 && (
                                    <span className="task__count" title="Attachments">📎 {t.attachments.length}</span>
                                  )}
                                  {t.description && <span className="task__note" title="Has description">📝</span>}
                                  {t.dueDate && (
                                    <span className={`due ${isOverdue(t, doneColumn) ? 'is-overdue' : ''}`}>
                                      📅 {formatDate(t.dueDate)}
                                    </span>
                                  )}
                                </div>
                              )}

                              {canEdit && <div className="task__move">
                                <button onClick={() => shiftTask(t.id, -1)} disabled={colIdx === 0} aria-label={tr('board.moveLeft')}>
                                  <Icon name="left" size={15} />
                                </button>
                                <button onClick={() => shiftTask(t.id, 1)} disabled={colIdx === columns.length - 1} aria-label={tr('board.moveRight')}>
                                  <Icon name="right" size={15} />
                                </button>
                              </div>}
                            </li>
                          );
                        })}
                      {!loading && items.length === 0 && (
                        <li className="column__empty">{search ? tr('board.noMatch') : tr('board.dropHere')}</li>
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}

          {isOwner && (
            <button className="link-btn" onClick={resetBoard}>
              {user ? tr('board.resetBoard') : tr('board.resetDemo')}
            </button>
          )}
        </Reveal>
      </div>

      <Suspense fallback={null}>
        {/* ✏️ Edit popup */}
        {editingTask && (
          <TaskModal
            key={editingTask.id}
            task={editingTask}
            boardId={boardId}
            people={people}
            labels={board?.labels}
            readOnly={!canEdit}
            onUpload={user ? uploadAttachment : undefined}
            onDeleteAttachment={user ? deleteAttachment : undefined}
            onTimer={user ? timerTask : undefined}
            onAddLink={user ? addLink : undefined}
            onDeleteLink={user ? deleteLink : undefined}
            onSave={saveTask}
            onClose={() => setEditingId(null)}
            onComment={addComment}
            onDeleteComment={deleteComment}
          />
        )}
  
        {/* 🆕 ⚙️ Board settings popup */}
        {settingsOpen && board && (
          <BoardSettingsModal
            board={board}
            canDelete={boards.length > 1}
            onSave={saveBoardSettings}
            onDelete={deleteBoard}
            onClose={() => setSettingsOpen(false)}
            onMembersChange={onMembersChange}
          />
        )}
      </Suspense>
    </section>
  );
}
