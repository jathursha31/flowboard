import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../api.ts';
import { trackEvent } from '../analytics.ts';
import { useLang } from '../context/LanguageContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { timeAgo } from '../utils/timeAgo.ts';
import type { FormEvent, KeyboardEvent } from 'react';

// 💬 Board team chat: board la irukkura ellaarum pesalaam. Live update: Demo SSE 'chat' vandhaa refreshKey maarum

export interface ChatMessage {
  id: string;
  userId: string;
  name: string;
  avatarColor: string;
  text: string;
  createdAt: string;
  mine: boolean;
  canDelete: boolean;
}
interface Page {
  messages: ChatMessage[];
  hasMore: boolean;
}
interface Props {
  boardId: string;
  refreshKey?: number;
  onClose: () => void;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

// "@Bala" ah thookki kaattu
function withMentions(text: string) {
  return text.split(/(@[\p{L}\p{M}\p{N}_.-]{2,40})/gu).map((part, i) => (i % 2 ? <mark key={i} className="mention">{part}</mark> : part));
}

export default function ChatPanel({ boardId, refreshKey = 0, onClose }: Props) {
  const { t, locale } = useLang();
  const toast = useToast();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const loadedOlder = useRef(false); // 'older' click pannirundhaa, refresh la avai poga koodaadhu
  const stickToBottom = useRef(true); // keezha irundhaa mattum pudhu message ku scroll (pazhasu padikkumbodhu thallaadhe)

  // 📜 Pudhu messages: board maarinaa / live update vandhaa
  useEffect(() => {
    let ignore = false;
    api<Page>(`/api/boards/${boardId}/chat`)
      .then((page) => {
        if (ignore) return;
        setMessages((old) => {
          // Munnaadi "older" la load panna pazhaya messages ah vechukko (ObjectId string: pazhasu = chinnadhu)
          const kept = loadedOlder.current ? (old ?? []).filter((m) => page.messages.length > 0 && m.id < page.messages[0].id) : [];
          return [...kept, ...page.messages];
        });
        if (!loadedOlder.current) setHasMore(page.hasMore);
      })
      .catch(() => !ignore && (setMessages([]), toast(t('chat.error'), 'error')));
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, refreshKey]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && stickToBottom.current) list.scrollTop = list.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const list = listRef.current;
    if (list) stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  };

  const loadOlder = async () => {
    if (!messages?.length) return;
    try {
      const page = await api<Page>(`/api/boards/${boardId}/chat?before=${messages[0].id}`);
      stickToBottom.current = false;
      loadedOlder.current = true;
      setMessages((list) => [...page.messages, ...(list ?? [])]);
      setHasMore(page.hasMore);
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const clean = text.trim();
    if (!clean || sending) return;
    setSending(true);
    try {
      const sent = await api<ChatMessage>(`/api/boards/${boardId}/chat`, 'POST', { text: clean });
      stickToBottom.current = true;
      setMessages((list) => [...(list ?? []).filter((m) => m.id !== sent.id), sent]);
      trackEvent('chat_sent'); // 📊
      setText('');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSending(false);
    }
  };

  // ⌨️ Enter = anuppu, Shift + Enter = pudhu line
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const remove = async (message: ChatMessage) => {
    if (!window.confirm(t('chat.confirmDelete'))) return;
    try {
      await api(`/api/chat/${message.id}`, 'DELETE');
      setMessages((list) => (list ?? []).filter((m) => m.id !== message.id));
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  return (
    <section className="activity-panel chat-panel" aria-label={t('chat.title')}>
      <div className="plan-day__head">
        <h3>{t('chat.title')}</h3>
        <button type="button" className="icon-x" onClick={onClose} aria-label={t('plan.close')}>×</button>
      </div>

      <ol className="chat" ref={listRef} onScroll={onScroll} aria-live="polite">
        {hasMore && (
          <li className="chat__older">
            <button type="button" className="link-btn" onClick={loadOlder}>{t('chat.older')}</button>
          </li>
        )}
        {messages === null && <li className="muted">…</li>}
        {messages?.length === 0 && <li className="muted chat__empty">{t('chat.empty')}</li>}
        {messages?.map((m) => (
          <li key={m.id} className={`chat__msg ${m.mine ? 'is-mine' : ''}`}>
            <span className="avatar avatar--sm" style={{ background: m.avatarColor }} aria-hidden="true">{initials(m.name)}</span>
            <div className="chat__bubble">
              <p className="chat__meta">
                <strong>{m.name}</strong> <time dateTime={m.createdAt}>{timeAgo(m.createdAt, locale)}</time>
                {m.canDelete && (
                  <button type="button" className="chat__delete" onClick={() => remove(m)} aria-label={t('chat.delete')} title={t('chat.delete')}>×</button>
                )}
              </p>
              <p className="chat__text">{withMentions(m.text)}</p>
            </div>
          </li>
        ))}
      </ol>

      <form className="chat__form" onSubmit={send}>
        <label className="sr-only" htmlFor="chat-input">{t('chat.placeholder')}</label>
        <textarea
          id="chat-input"
          rows={2}
          value={text}
          maxLength={1000}
          placeholder={t('chat.placeholder')}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="submit" className="btn btn--primary" disabled={!text.trim() || sending}>{t('chat.send')}</button>
      </form>
    </section>
  );
}
