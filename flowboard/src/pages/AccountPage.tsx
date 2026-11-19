import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import DeveloperSection from '../components/DeveloperSection.tsx';
import PlanSection from '../components/PlanSection.tsx';
import AppearanceSection from '../components/AppearanceSection.tsx';
import PushSection from '../components/PushSection.tsx';
import CalendarSection from '../components/CalendarSection.tsx';
import type { ChangeEvent, FormEvent } from 'react';

// Server la irukkura athe colours
const AVATAR_COLORS = ['#5b5bf0', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#64748b'];

// "jathu Naga" → "JN"
function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0].toUpperCase())
    .join('');
}

// 👤 "/account" page: profile, password, stats, account delete
interface Stats {
  totalTasks: number;
  done: number;
  open: number;
  overdue: number;
  thisWeek: number;
  streak: number;
  week: { day: string; count: number }[];
  ownedBoards: number;
  sharedBoards: number;
  memberSince: string;
}
interface InboxItem {
  id: string;
  message: string;
  createdAt: string;
  reply: { text: string; at: string } | null;
}
interface ImportResult {
  format: 'flowboard' | 'trello';
  boards: { id: string; name: string; tasks: number }[];
}

export default function AccountPage() {
  const { user, setUser, checking } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [color, setColor] = useState(AVATAR_COLORS[0]);
  const [savingProfile, setSavingProfile] = useState(false);

  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [passwordError, setPasswordError] = useState('');

  const [stats, setStats] = useState<Stats | null>(null);
  const [inbox, setInbox] = useState<InboxItem[] | null>(null); // 🆕 ✉️ en messages + admin reply
  const [importing, setImporting] = useState(false); // 🆕 📦
  const [imported, setImported] = useState<ImportResult | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');

  // 🔐 Login illana sign in page ku
  useEffect(() => {
    if (!checking && !user) navigate('/signin', { replace: true });
  }, [checking, user, navigate]);

  // 📝 User vandhadhum form la podu + 📊 stats edu
  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setColor(user.avatarColor);
    api('/api/account/stats')
      .then(setStats)
      .catch(() => toast("Couldn't load your stats", 'error'));
    api('/api/account/messages')
      .then(setInbox)
      .catch(() => setInbox([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  if (!user) return <main className="page" />;

  // 💾 Profile save
  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const data = await api('/api/account', 'PATCH', { name, avatarColor: color });
      setUser(data.user); // ✅ navbar um udane maarum
      toast('Profile updated');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  // 🔑 Password maathu
  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    try {
      await api('/api/account/password', 'POST', passwords);
      setPasswords({ currentPassword: '', newPassword: '' });
      if (!user.hasPassword) {
        setUser({ ...user, hasPassword: true }); // 🔵 Google user ippo password la um login pannalaam
        toast('Password set. You can now also log in with your email and password.');
      } else toast('Password changed. Other devices were logged out.');
    } catch (err) {
      setPasswordError((err as Error).message);
    }
  };

  // 🗑️ Account delete
  const deleteAccount = async (e: FormEvent) => {
    e.preventDefault();
    setDeleteError('');
    try {
      // 🔵 Password illaadha Google account: email type panni confirm
      await api('/api/account', 'DELETE', user.hasPassword ? { password: deletePassword } : { confirmEmail: deletePassword });
      setUser(null);
      toast('Your account was deleted.');
      navigate('/', { replace: true });
    } catch (err) {
      setDeleteError((err as Error).message);
    }
  };

  const updatePw = (e: ChangeEvent<HTMLInputElement>) => setPasswords((p) => ({ ...p, [e.target.name]: e.target.value }));
  const weekMax = Math.max(1, ...(stats?.week ?? []).map((d) => d.count));
  const changed = name.trim() !== user.name || color !== user.avatarColor;

  return (
    <main className="page account-page">
      <div className="container account">
        <header className="account__head">
          <span className="avatar avatar--lg" style={{ background: color }} aria-hidden="true">
            {initials(name || user.name)}
          </span>
          <div>
            <h1>{user.name}</h1>
            <p>{user.email}</p>
          </div>
          <div className="account__head-actions">
            <Link to="/reports" className="btn btn--outline">📊 Reports</Link>
            <Link to="/app" className="btn btn--primary account__board-link">Open my board</Link>
          </div>
        </header>

        {/* 📊 My stats */}
        <section className="card account__card">
          <h2>📊 My stats</h2>
          {!stats ? (
            <p className="muted">Loading…</p>
          ) : (
            <>
              <div className="stat-tiles">
                <div className="stat-tile">
                  <b>{stats.thisWeek}</b>
                  <span>done this week</span>
                </div>
                <div className="stat-tile">
                  <b>🔥 {stats.streak}</b>
                  <span>day streak</span>
                </div>
                <div className="stat-tile">
                  <b>{stats.open}</b>
                  <span>open tasks</span>
                </div>
                <div className={`stat-tile ${stats.overdue ? 'stat-tile--warn' : ''}`}>
                  <b>{stats.overdue}</b>
                  <span>overdue</span>
                </div>
                <div className="stat-tile">
                  <b>{stats.ownedBoards}</b>
                  <span>{stats.ownedBoards === 1 ? 'board' : 'boards'}{stats.sharedBoards ? ` + ${stats.sharedBoards} shared` : ''}</span>
                </div>
              </div>

              <div className="week-chart" aria-label="Tasks completed in the last 7 days">
                {stats.week.map((d) => (
                  <div key={d.day} className="week-chart__day">
                    <span className="week-chart__bar" style={{ height: `${(d.count / weekMax) * 100}%` }} title={`${d.count} done`}>
                      <i>{d.count || ''}</i>
                    </span>
                    <small>{new Date(`${d.day}T00:00`).toLocaleDateString(undefined, { weekday: 'short' })}</small>
                  </div>
                ))}
              </div>
              <p className="muted small">
                Tasks count as done when they move into a board&apos;s last column. Member since{' '}
                {new Date(stats.memberSince).toLocaleDateString()}.
              </p>
            </>
          )}
        </section>

        {/* 🆕 💎 Plan + billing */}
        <PlanSection />

        {/* 🖼️ Profile */}
        <section className="card account__card">
          <h2>🖼️ Profile</h2>
          <form className="account__form" onSubmit={saveProfile}>
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" />
            </label>
            <fieldset className="color-picker">
              <legend>Avatar colour</legend>
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`color-swatch ${color === c ? 'is-on' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={`Colour ${c}`}
                  aria-pressed={color === c}
                />
              ))}
            </fieldset>
            <button className="btn btn--primary" type="submit" disabled={savingProfile || !changed || name.trim().length < 2}>
              {savingProfile ? 'Saving…' : 'Save profile'}
            </button>
          </form>
        </section>

        {/* 🆕 🎨 Theme + accent */}
        <AppearanceSection />

        {/* 🆕 🔔 Push alerts */}
        <PushSection />

        {/* 🆕 📅 Calendar feed */}
        <CalendarSection />

        {/* 🆕 ✉️ Messages + replies */}
        <section className="card account__card">
          <h2>✉️ Messages &amp; replies</h2>
          {inbox === null ? (
            <p className="muted">Loading…</p>
          ) : inbox.length === 0 ? (
            <p className="muted">
              No messages yet. Send us a message from the <Link to="/#contact">contact form</Link> while logged in and our
              reply will show up here.
            </p>
          ) : (
            <ol className="inbox">
              {inbox.map((m) => (
                <li key={m.id} className="inbox__item">
                  <time dateTime={m.createdAt}>You wrote · {new Date(m.createdAt).toLocaleString()}</time>
                  <p>{m.message}</p>
                  {m.reply ? (
                    <div className="inbox__reply">
                      <strong>💬 Flowboard team · {new Date(m.reply.at).toLocaleDateString()}</strong>
                      <p>{m.reply.text}</p>
                    </div>
                  ) : (
                    <p className="inbox__waiting">⏳ Waiting for a reply</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* 🔑 Password */}
        <section className="card account__card">
          <h2>🔑 {user.hasPassword ? 'Change password' : 'Set a password'}</h2>
          <form className="account__form" onSubmit={changePassword}>
            {user.hasPassword ? (
              <label>
                Current password
                <input type="password" name="currentPassword" value={passwords.currentPassword} onChange={updatePw} autoComplete="current-password" />
              </label>
            ) : (
              <p className="muted">You signed in with Google. Add a password to also log in with your email.</p>
            )}
            <label>
              New password (8+ characters)
              <input type="password" name="newPassword" value={passwords.newPassword} onChange={updatePw} autoComplete="new-password" />
            </label>
            {passwordError && <p className="modal__error">{passwordError}</p>}
            <button
              className="btn btn--primary"
              type="submit"
              disabled={(user.hasPassword && !passwords.currentPassword) || passwords.newPassword.length < 8}
            >
              {user.hasPassword ? 'Change password' : 'Set password'}
            </button>
          </form>
        </section>

        {/* 🆕 📦 Your data: backup + import */}
        <section className="card account__card">
          <h2>📦 Your data</h2>
          <p className="muted">Download a backup of all your boards, or import a backup or a Trello board (Menu → Print, export and share → Export as JSON).</p>
          <div className="data-actions">
            <a className="btn btn--outline" href="/api/account/export" download>⬇️ Download my data (JSON)</a>
            <label className={`btn btn--primary ${importing ? 'is-busy' : ''}`}>
              {importing ? 'Importing…' : '⬆️ Import a file'}
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                disabled={importing}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  if (file.size > 5 * 1024 * 1024) return toast('Files can be up to 5 MB.', 'error');
                  setImporting(true);
                  try {
                    const data = JSON.parse(await file.text());
                    const result = await api<ImportResult>('/api/import', 'POST', data);
                    setImported(result);
                    toast(`Imported ${result.boards.length} board${result.boards.length === 1 ? '' : 's'} from ${result.format === 'trello' ? 'Trello' : 'a backup'}`);
                  } catch (err) {
                    toast(err instanceof SyntaxError ? 'That file is not valid JSON.' : (err as Error).message, 'error');
                  } finally {
                    setImporting(false);
                  }
                }}
              />
            </label>
          </div>
          {imported && (
            <ul className="data-imported">
              {imported.boards.map((b) => (
                <li key={b.id}>
                  ✅ <Link to={`/app?board=${b.id}`}>{b.name}</Link> · {b.tasks} tasks
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 🆕 🔌 Developers: API keys + webhooks */}
        <DeveloperSection />

        {/* 🗑️ Danger zone */}
        <section className="card account__card account__danger">
          <h2>🗑️ Delete account</h2>
          <p className="muted">
            This permanently deletes your account, your boards and all their tasks. You&apos;ll also be removed from boards
            others shared with you. This can&apos;t be undone.
          </p>
          {!deleteOpen ? (
            <button type="button" className="btn btn--danger" onClick={() => setDeleteOpen(true)}>Delete my account…</button>
          ) : (
            <form className="account__form" onSubmit={deleteAccount}>
              <label>
                {user.hasPassword ? 'Type your password to confirm' : `Type your email (${user.email}) to confirm`}
                <input
                  type={user.hasPassword ? 'password' : 'email'}
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  autoComplete={user.hasPassword ? 'current-password' : 'off'}
                  autoFocus
                />
              </label>
              {deleteError && <p className="modal__error">{deleteError}</p>}
              <div className="modal__actions modal__actions--start">
                <button type="button" className="btn btn--outline" onClick={() => setDeleteOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn--danger" disabled={!deletePassword}>Permanently delete</button>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
