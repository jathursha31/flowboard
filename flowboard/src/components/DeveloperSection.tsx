import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { useToast } from '../context/ToastContext.tsx';
import type { FormEvent } from 'react';
import type { Board } from '../types.ts';

// 🔌 Account page: personal API keys + board webhooks (developers / Zapier / sondha scripts ku)

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}
interface Delivery {
  at: string;
  event: string;
  status: number | null;
  ok: boolean;
  error?: string;
  ms: number;
}
interface Webhook {
  id: string;
  boardId: string;
  url: string;
  format?: 'slack' | 'discord' | 'json';
  events: string[];
  active: boolean;
  failures: number;
  deliveries: Delivery[];
}

const when = (date: string | null) => (date ? new Date(date).toLocaleString() : 'never');

// 📋 Copy panna mudiyura secret box (ore thadavai mattum kaattuvom)
function Reveal({ label, value, onDone }: { label: string; value: string; onDone: () => void }) {
  const toast = useToast();
  return (
    <div className="dev-reveal" role="status">
      <p>
        <strong>{label}</strong> Copy it now — you won&apos;t be able to see it again.
      </p>
      <code>{value}</code>
      <div className="data-actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => navigator.clipboard?.writeText(value).then(() => toast('Copied'), () => toast("Couldn't copy. Select it and copy by hand.", 'error'))}
        >
          📋 Copy
        </button>
        <button type="button" className="btn btn--outline" onClick={onDone}>I saved it</button>
      </div>
    </div>
  );
}

function ApiKeys() {
  const toast = useToast();
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [name, setName] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);

  useEffect(() => {
    api<ApiKey[]>('/api/keys').then(setKeys, () => setKeys([]));
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const made = await api<ApiKey & { key: string }>('/api/keys', 'POST', { name });
      setKeys((list) => [made, ...(list ?? [])]);
      setFresh(made.key);
      setName('');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const revoke = async (key: ApiKey) => {
    if (!window.confirm(`Revoke "${key.name}"? Scripts using it will stop working right away.`)) return;
    try {
      await api(`/api/keys/${key.id}`, 'DELETE');
      setKeys((list) => (list ?? []).filter((k) => k.id !== key.id));
      toast('Key revoked');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  return (
    <section className="card account__card">
      <h2>🔑 API keys</h2>
      <p className="muted">
        Use Flowboard from your own scripts. Send the key as <code>Authorization: Bearer fb_…</code>. A key can read and
        change your boards and tasks, but can&apos;t change your account. See the <a href="/api/docs" target="_blank" rel="noreferrer">API docs</a>.
      </p>
      {fresh && <Reveal label="Your new API key." value={fresh} onDone={() => setFresh(null)} />}
      <form className="dev-row" onSubmit={create}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Key name, e.g. My script" maxLength={40} aria-label="Key name" />
        <button className="btn btn--primary" type="submit" disabled={!name.trim()}>Create key</button>
      </form>
      {keys === null ? (
        <p className="muted">Loading…</p>
      ) : keys.length === 0 ? (
        <p className="muted small">No keys yet.</p>
      ) : (
        <ul className="dev-list">
          {keys.map((k) => (
            <li key={k.id}>
              <div>
                <strong>{k.name}</strong> <code>{k.prefix}…</code>
                <small className="muted">Created {when(k.createdAt)} · Last used {when(k.lastUsedAt)}</small>
              </div>
              <button type="button" className="btn btn--outline btn--sm" onClick={() => revoke(k)}>Revoke</button>
            </li>
          ))}
        </ul>
      )}
      <details className="dev-example">
        <summary>Example</summary>
        <pre>{`curl ${window.location.origin}/api/boards \\\n  -H "Authorization: Bearer fb_your_key"`}</pre>
      </details>
    </section>
  );
}

function Webhooks() {
  const toast = useToast();
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardId, setBoardId] = useState('');
  const [hooks, setHooks] = useState<Webhook[] | null>(null);
  const [allEvents, setAllEvents] = useState<string[]>([]);
  const [url, setUrl] = useState('');
  const [picked, setPicked] = useState<string[]>(['*']);
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState('');

  // Webhooks owner boards la mattum
  useEffect(() => {
    api<Board[]>('/api/boards').then((list) => {
      const mine = list.filter((b) => (b.access ?? (b.role === 'owner' ? 'owner' : 'editor')) === 'owner');
      setBoards(mine);
      setBoardId((id) => id || mine[0]?.id || '');
    }, () => setBoards([]));
  }, []);

  useEffect(() => {
    if (!boardId) return;
    setHooks(null);
    api<{ events: string[]; webhooks: Webhook[] }>(`/api/boards/${boardId}/webhooks`).then(
      (data) => {
        setHooks(data.webhooks);
        setAllEvents(data.events);
      },
      () => setHooks([])
    );
  }, [boardId]);

  const replace = (hook: Webhook) => setHooks((list) => (list ?? []).map((h) => (h.id === hook.id ? hook : h)));

  const toggleEvent = (event: string) =>
    setPicked((list) => {
      if (event === '*') return ['*'];
      const rest = list.filter((e) => e !== '*');
      const next = rest.includes(event) ? rest.filter((e) => e !== event) : [...rest, event];
      return next.length ? next : ['*'];
    });

  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const made = await api<Webhook & { secret: string }>(`/api/boards/${boardId}/webhooks`, 'POST', { url, events: picked });
      setHooks((list) => [...(list ?? []), made]);
      setFresh(made.secret);
      setUrl('');
      setPicked(['*']);
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const test = async (hook: Webhook) => {
    setBusy(hook.id);
    try {
      const d = await api<Delivery>(`/api/webhooks/${hook.id}/test`, 'POST');
      if (d.ok) toast(`Ping delivered (${d.status}, ${d.ms} ms)`);
      else toast(`Ping failed: ${d.status ?? d.error}`, 'error');
      replace({ ...hook, deliveries: [d, ...hook.deliveries].slice(0, 10) });
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const toggle = async (hook: Webhook) => {
    try {
      replace(await api<Webhook>(`/api/webhooks/${hook.id}`, 'PATCH', { active: !hook.active }));
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const remove = async (hook: Webhook) => {
    if (!window.confirm('Delete this webhook?')) return;
    try {
      await api(`/api/webhooks/${hook.id}`, 'DELETE');
      setHooks((list) => (list ?? []).filter((h) => h.id !== hook.id));
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  return (
    <section className="card account__card">
      <h2>🪝 Webhooks</h2>
      <p className="muted">
        Get a POST to your URL whenever a task changes on one of your boards. Each request is signed with{' '}
        <code>X-Flowboard-Signature</code> so you can check it really came from us.
      </p>
      <p className="muted small">
        💬 <strong>Slack or Discord?</strong> Paste a Slack incoming-webhook URL (<code>hooks.slack.com/…</code>) or a Discord channel webhook URL and
        updates arrive as readable messages, like “Anu ✅ completed ‘Logo’ → Done”.
      </p>
      {boards.length === 0 ? (
        <p className="muted small">Webhooks can be added to boards you own.</p>
      ) : (
        <>
          <label className="dev-board">
            Board
            <select value={boardId} onChange={(e) => setBoardId(e.target.value)}>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
          {fresh && <Reveal label="Your signing secret." value={fresh} onDone={() => setFresh(null)} />}
          <form className="dev-hook-form" onSubmit={create}>
            <div className="dev-row">
              <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/flowboard-hook" aria-label="Webhook URL" />
              <button className="btn btn--primary" type="submit" disabled={!url.trim()}>Add webhook</button>
            </div>
            <fieldset className="dev-events">
              <legend>Events</legend>
              {['*', ...allEvents].map((ev) => (
                <label key={ev}>
                  <input type="checkbox" checked={picked.includes(ev)} onChange={() => toggleEvent(ev)} /> {ev === '*' ? 'All events' : ev}
                </label>
              ))}
            </fieldset>
          </form>
          {hooks === null ? (
            <p className="muted">Loading…</p>
          ) : hooks.length === 0 ? (
            <p className="muted small">No webhooks on this board yet.</p>
          ) : (
            <ul className="dev-list">
              {hooks.map((h) => {
                const last = h.deliveries[0];
                return (
                  <li key={h.id} className={h.active ? '' : 'is-off'}>
                    <div>
                      <strong className="dev-url">
                        {h.format === 'slack' ? '💬 Slack · ' : h.format === 'discord' ? '🎮 Discord · ' : ''}
                        {h.url}
                      </strong>
                      <small className="muted">
                        {h.active ? '🟢 On' : h.failures >= 10 ? '🔴 Turned off after 10 failed deliveries' : '⚪ Off'} ·{' '}
                        {h.events.includes('*') ? 'All events' : h.events.join(', ')}
                        {last && ` · Last: ${last.ok ? '✅' : '❌'} ${last.status ?? last.error} (${new Date(last.at).toLocaleTimeString()})`}
                      </small>
                      {h.deliveries.length > 0 && (
                        <details className="dev-example">
                          <summary>Recent deliveries</summary>
                          <ol>
                            {h.deliveries.map((d, i) => (
                              <li key={i}>
                                {d.ok ? '✅' : '❌'} {d.event} · {d.status ?? d.error} · {d.ms} ms · {new Date(d.at).toLocaleString()}
                              </li>
                            ))}
                          </ol>
                        </details>
                      )}
                    </div>
                    <div className="dev-actions">
                      <button type="button" className="btn btn--outline btn--sm" onClick={() => test(h)} disabled={busy === h.id}>
                        {busy === h.id ? 'Sending…' : 'Send test'}
                      </button>
                      <button type="button" className="btn btn--outline btn--sm" onClick={() => toggle(h)}>{h.active ? 'Turn off' : 'Turn on'}</button>
                      <button type="button" className="btn btn--outline btn--sm" onClick={() => remove(h)}>Delete</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export default function DeveloperSection() {
  return (
    <>
      <ApiKeys />
      <Webhooks />
    </>
  );
}
