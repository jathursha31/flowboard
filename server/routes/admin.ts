import express from 'express';
import crypto from 'node:crypto';
import { BANNER_TONES } from '../lib/constants.ts';
import { adminUrl, csvCell, dayKey, escapeHtml, escapeRegex, getCookie, isText, lastDays, mailtoLink, toObjectId } from '../lib/helpers.ts';
import { adminLoginLimit } from '../lib/rateLimit.ts';
import { audit, checkPassword, requireAdmin } from '../lib/auth.ts';
import { sendEmail } from '../lib/email.ts';
import { metricsSnapshot } from '../lib/observability.ts';
import { invalidate } from '../lib/cache.ts';
import { dbPing } from './health.ts';
import { analyticsSummary } from '../lib/analytics.ts';
import { auditLog, messages, reviews, sessions, settings, tasks, updates, userSessions, users } from '../db.ts';

// 👮 Admin side: login page, /admin dashboard (HTML), admin actions
const router = express.Router();

// 🏠 Vaasal page: links menu
router.get('/', (req, res) => {
  res.send(`
    <h1>🏭 Flowboard Backend</h1>
    <p>Server odudhu! ☁️ MongoDB connected. Intha links click pannunga:</p>
    <ul>
      <li><a href="/admin">📊 /admin: admin page (🔐 login venum)</a></li>
      <li><a href="/api/hello">👋 /api/hello</a></li>
      <li><a href="/api/auth/me">👤 /api/auth/me: yaar login aagirukkaanga</a></li>
      <li><a href="/api/messages">📨 /api/messages (🔐 login venum)</a></li>
      <li><a href="/api/tasks">🎮 /api/tasks: demo board tasks</a></li>
    </ul>
    <p>🎨 Website: <a href="http://localhost:5173">localhost:5173</a></p>
  `);
});

// 🔐 Admin login page
router.get('/login', (req, res) => {
  const error = req.query.error ? '<p class="err">❌ Email / password thappu!</p>' : '';
  const emailBox = adminEmails().length
    ? '<input type="email" name="email" placeholder="Admin email (website account)" autocomplete="username" autofocus />'
    : '';
  res.send(`<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Admin Login</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f6f7fb; display: grid; place-items: center; min-height: 100vh; margin: 0; }
    form { background: #fff; padding: 32px; border-radius: 16px; box-shadow: 0 10px 30px -12px rgba(0,0,0,.2); width: min(340px, 90vw); }
    h1 { margin-top: 0; font-size: 24px; }
    input { width: 100%; margin-bottom: 10px; padding: 12px; border: 1px solid #e3e7ef; border-radius: 10px; font-size: 16px; box-sizing: border-box; }
    button { width: 100%; margin-top: 12px; padding: 12px; border: 0; border-radius: 10px; background: #5b5bf0; color: #fff; font-size: 16px; cursor: pointer; }
    .err { color: #ef4444; }
  </style>
</head>
<body>
  <form method="POST" action="/login">
    <h1>🔐 Admin Login</h1>
    ${error}
    ${emailBox}
    <input type="password" name="password" placeholder="Password" autocomplete="current-password" required ${emailBox ? '' : 'autofocus'} />
    <button type="submit">Login</button>
  </form>
</body>
</html>`);
});

// 📧 ADMIN_EMAIL (.env) la irukkura emails: comma pottu pala per podalaam
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAIL ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// 🔑 Rendu vazhi: (1) admin email + andha website account oda password, (2) email illaama ADMIN_PASSWORD
async function isAdminLogin(email: unknown, password: unknown): Promise<boolean> {
  if (!isText(password) || !password) return false;
  if (isText(email) && email.trim()) {
    const wanted = email.trim().toLowerCase();
    if (!adminEmails().includes(wanted)) return false;
    const user = await users.findOne({ email: wanted });
    return Boolean(user && !user.disabled && (await checkPassword(password, user.passwordHash)));
  }
  return Boolean(process.env.ADMIN_PASSWORD) && password === process.env.ADMIN_PASSWORD;
}

// 🎫 Admin password check panni ticket kudu (🚦 adminLoginLimit: 15 nimishaththukku 5 try)
router.post('/login', adminLoginLimit, async (req, res) => {
  const { email, password } = req.body || {};

  if (!(await isAdminLogin(email, password))) {
    console.log('🚫 Thappaana password try!');
    await audit(req, 'login.failed', 'Wrong admin password'); // 🆕 📜
    return res.redirect('/login?error=1');
  }

  const token = crypto.randomUUID();
  await sessions.insertOne({ token, createdAt: new Date() });

  res.cookie('admin_token', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure, // 🔒 HTTPS la mattum
    maxAge: 1000 * 60 * 60 * 8,
  });

  console.log('✅ Admin login aanaanga');
  await audit(req, 'login', 'Admin logged in'); // 🆕 📜
  res.redirect('/admin');
});

// 🚪 Admin logout
router.post('/logout', async (req, res) => {
  const token = getCookie(req, 'admin_token');
  if (token && (await sessions.deleteOne({ token })).deletedCount) await audit(req, 'logout', 'Admin logged out'); // 🆕 📜
  res.clearCookie('admin_token');
  res.redirect('/login');
});

// 📊 Admin page
router.get('/admin', requireAdmin, async (req, res) => {
  // 🔍 Search box la type pannadhu (URL la ?q=raju nu varum). Max 100 letters
  const q = isText(req.query.q) ? req.query.q.trim().slice(0, 100) : '';

  // 🔍 q irundhaa: name / email / message la edhula irundhaalum match (i = CAPITAL/small paakkaadhe)
  const filter = q
    ? {
        $or: ['name', 'email', 'message'].map((field) => ({
          [field]: { $regex: escapeRegex(q), $options: 'i' },
        })),
      }
    : {};

  const allMessages = await messages.find(filter).sort({ _id: -1 }).toArray();
  const totalMessages = await messages.countDocuments(); // 🔢 search illaama motham ethanai
  const unreadCount = await messages.countDocuments({ read: { $ne: true } }); // 🆕 📬 padikkaadhadhu
  const userCount = await users.countDocuments();

  const groups = await tasks.aggregate([{ $group: { _id: '$column', count: { $sum: 1 } } }]).toArray();
  const counts = { todo: 0, doing: 0, done: 0 };
  for (const g of groups) if (g._id in counts) counts[g._id as keyof typeof counts] = g.count;

  // 🆕 👥 Users list (passwordHash KANDIPPAA edukka koodaadhu: projection la 0 pottu thavirkkurom)
  const allUsers = await users.find({}, { projection: { passwordHash: 0 } }).sort({ _id: -1 }).toArray();

  // 🆕 🔢 Ovvoru user kkum ethanai tasks
  const taskGroups = await tasks
    .aggregate([{ $match: { userId: { $ne: null } } }, { $group: { _id: '$userId', count: { $sum: 1 } } }])
    .toArray();
  const taskCountByUser = new Map(taskGroups.map((g) => [g._id.toString(), g.count]));

  // 🆕 📈 Kadaisi 7 naal: naal vaariyaa messages + sign ups enni
  const days = lastDays(7);
  const perDay = new Map(days.map((d) => [dayKey(d), { messages: 0, signups: 0 }]));
  const recentMessages = await messages.find({ createdAt: { $gte: days[0] } }, { projection: { createdAt: 1 } }).toArray();
  const recentUsers = await users.find({ createdAt: { $gte: days[0] } }, { projection: { createdAt: 1 } }).toArray();
  for (const m of recentMessages) {
    const day = perDay.get(dayKey(m.createdAt));
    if (day) day.messages++;
  }
  for (const u of recentUsers) {
    const day = perDay.get(dayKey(u.createdAt));
    if (day) day.signups++;
  }
  const chartMax = Math.max(1, ...[...perDay.values()].flatMap((v) => [v.messages, v.signups]));

  const chartBars = days
    .map((d) => {
      const v = perDay.get(dayKey(d)) ?? { messages: 0, signups: 0 };
      const label = d.toLocaleDateString(undefined, { weekday: 'short' });
      return `
      <div class="chart__day">
        <div class="chart__bars">
          <span class="bar bar--msg" style="height:${(v.messages / chartMax) * 100}%" title="${v.messages} messages"><i>${v.messages || ''}</i></span>
          <span class="bar bar--user" style="height:${(v.signups / chartMax) * 100}%" title="${v.signups} sign ups"><i>${v.signups || ''}</i></span>
        </div>
        <small>${escapeHtml(label)}</small>
      </div>`;
    })
    .join('');

  // 🆕 📊 Website analytics (kadaisi 30 naal)
  const stats = await analyticsSummary(30);
  const statMax = Math.max(1, ...stats.series.map((d) => d.pageviews));
  const statBars = stats.series
    .map(
      (d) => `
      <div class="chart__day">
        <div class="chart__bars">
          <span class="bar bar--view" style="height:${(d.pageviews / statMax) * 100}%" title="${escapeHtml(d.day)}: ${d.pageviews} page views"></span>
          <span class="bar bar--visit" style="height:${(d.visitors / statMax) * 100}%" title="${escapeHtml(d.day)}: ${d.visitors} visitors"></span>
        </div>
        <small>${Number(d.day.slice(8))}</small>
      </div>`
    )
    .join('');
  const change = (now: number, before: number) => (before ? ` <small class="${now >= before ? 'up' : 'down'}">${now >= before ? '▲' : '▼'} ${Math.abs(Math.round(((now - before) / before) * 100))}%</small>` : '');
  const topTable = (title: string, rows: { key: string; count: number }[], empty: string) => `
    <div class="top-box"><h3>${title}</h3>
      ${rows.length ? `<ol>${rows.map((r) => `<li><span>${escapeHtml(r.key)}</span><b>${r.count}</b></li>`).join('')}</ol>` : `<p class="empty">${empty}</p>`}
    </div>`;

  const tableRows = allMessages
    .map(
      (m, i) => `
      <tr class="${m.read ? '' : 'unread'}">
        <td>${m.read ? '' : '<span class="dot" title="Unread"></span>'}${i + 1}</td>
        <td>${escapeHtml(m.name)}</td>
        <td><a href="mailto:${escapeHtml(m.email)}">${escapeHtml(m.email)}</a></td>
        <td>${escapeHtml(m.team)}</td>
        <td class="msg-cell">
          <div class="msg">${escapeHtml(m.message)}</div>
          ${m.userId ? '<br><span class="badge badge--on">👤 Logged-in user</span>' : ''}
          ${m.reply ? `
          <div class="reply">
            <small>💬 Your reply · ${escapeHtml(new Date(m.reply.at).toLocaleString())}</small>
            <div>${escapeHtml(m.reply.text)}</div>
            ${m.reply.emailed ? '<small>📧 Sent by email</small>' : `<a href="${escapeHtml(mailtoLink(m.email, m.reply.text))}">📧 Open in email app</a>`}
          </div>` : ''}
          <details class="reply-box">
            <summary>${m.reply ? '✏️ Edit reply' : '↩️ Reply'}</summary>
            <form method="POST" action="/admin/messages/${m._id}/reply">
              <input type="hidden" name="q" value="${escapeHtml(q)}" />
              <textarea name="reply" rows="3" maxlength="2000" required placeholder="Write your reply…">${escapeHtml(m.reply?.text ?? '')}</textarea>
              <button type="submit" class="small-btn">💾 Save reply</button>
            </form>
          </details>
        </td>
        <td class="time">${escapeHtml(new Date(m.createdAt).toLocaleString())}</td>
        <td class="actions">
          <form method="POST" action="/admin/messages/${m._id}/toggle-read">
            <input type="hidden" name="q" value="${escapeHtml(q)}" />
            <button title="${m.read ? 'Mark as unread' : 'Mark as read'}">${m.read ? '📭' : '✉️'}</button>
          </form>
          <form method="POST" action="/admin/messages/${m._id}/delete" data-confirm="Intha message ah delete pannavaa?">
            <input type="hidden" name="q" value="${escapeHtml(q)}" />
            <button title="Delete">🗑️</button>
          </form>
        </td>
      </tr>`
    )
    .join('');

  // 🆕 👥 Users table rows
  const userRows = allUsers
    .map(
      (u) => `
      <tr class="${u.disabled ? 'disabled' : ''}">
        <td>${escapeHtml(u.name)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td class="time">${escapeHtml(new Date(u.createdAt).toLocaleDateString())}</td>
        <td>${taskCountByUser.get(u._id.toString()) ?? 0}</td>
        <td><span class="badge ${u.disabled ? 'badge--off' : 'badge--on'}">${u.disabled ? 'Disabled' : 'Active'}</span></td>
        <td>
          <form method="POST" action="/admin/users/${u._id}/toggle-disabled" data-confirm="${u.disabled ? 'Enable' : 'Disable'} this user?">
            <button class="small-btn">${u.disabled ? '✅ Enable' : '🚫 Disable'}</button>
          </form>
        </td>
      </tr>`
    )
    .join('');

  // 🆕 ⭐ Reviews (approve aagaadhadhu mudhalla)
  const allReviews = await reviews.find().sort({ approved: 1, _id: -1 }).toArray();
  const pendingReviews = allReviews.filter((r) => !r.approved).length;
  const reviewRows = allReviews
    .map(
      (r) => `
      <tr class="${r.approved ? '' : 'unread'}">
        <td>${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</td>
        <td>${escapeHtml(r.name)}${r.role ? `<br><small class="time">${escapeHtml(r.role)}</small>` : ''}</td>
        <td class="msg">${escapeHtml(r.text)}</td>
        <td><span class="badge ${r.approved ? 'badge--on' : 'badge--off'}">${r.approved ? 'Live' : 'Pending'}</span></td>
        <td class="actions">
          <form method="POST" action="/admin/reviews/${r._id}/toggle">
            <button class="small-btn">${r.approved ? '🙈 Hide' : '✅ Approve'}</button>
          </form>
          <form method="POST" action="/admin/reviews/${r._id}/delete" data-confirm="Delete this review?">
            <button title="Delete">🗑️</button>
          </form>
        </td>
      </tr>`
    )
    .join('');

  // 🆕 📰 Updates (pudhusu mudhalla)
  const allUpdates = await updates.find().sort({ _id: -1 }).toArray();
  const updateRows = allUpdates
    .map(
      (u) => `
      <tr>
        <td class="time">${escapeHtml(new Date(u.createdAt).toLocaleDateString())}</td>
        <td><strong>${escapeHtml(u.title)}</strong><br><span class="msg">${escapeHtml(u.body)}</span></td>
        <td>
          <form method="POST" action="/admin/updates/${u._id}/delete" data-confirm="Delete this update?">
            <button title="Delete">🗑️</button>
          </form>
        </td>
      </tr>`
    )
    .join('');

  // 🆕 📢 Ippo irukkura banner
  const banner = (await settings.findOne({ _id: 'banner' })) || { text: '', tone: 'info', active: false };
  const toneOptions = BANNER_TONES.map(
    (t) => `<option value="${t}" ${banner.tone === t ? 'selected' : ''}>${{ info: '💙 Info', success: '💚 Success', warning: '🧡 Warning' }[t]}</option>`
  ).join('');

  // 🆕 📜 Kadaisi 40 audit entries
  const auditEntries = await auditLog.find().sort({ _id: -1 }).limit(40).toArray();
  const auditRows = auditEntries
    .map(
      (a) => `
      <tr class="${a.action === 'login.failed' ? 'warn' : ''}">
        <td class="time">${escapeHtml(new Date(a.createdAt).toLocaleString())}</td>
        <td><code>${escapeHtml(a.action)}</code></td>
        <td>${escapeHtml(a.detail)}</td>
        <td class="time">${escapeHtml(a.ip || '')}</td>
      </tr>`
    )
    .join('');
  // 🆕 🩺 Server health numbers
  const health = metricsSnapshot();
  const dbHealth = await dbPing();
  const fmtUptime = (sec: number) => `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  const routeRows = (list: { route: string; count: number; avgMs: number; maxMs?: number }[], withMax: boolean) =>
    list.map((r) => `<tr><td><code>${escapeHtml(r.route)}</code></td><td>${r.count}</td><td>${r.avgMs} ms</td>${withMax ? `<td>${r.maxMs} ms</td>` : ''}</tr>`).join('') ||
    `<tr><td colspan="${withMax ? 4 : 3}" class="empty">Innum requests illa</td></tr>`;
  const errorRows =
    health.recentErrors
      .map((e) => `<tr class="warn"><td class="time">${escapeHtml(new Date(e.at).toLocaleString())}</td><td><code>${escapeHtml(e.method)} ${escapeHtml(e.path)}</code></td><td>${escapeHtml(e.message)}</td><td><code>${escapeHtml(e.requestId.slice(0, 8))}</code></td></tr>`)
      .join('') || '<tr><td colspan="4" class="empty">Errors illa 🎉</td></tr>';

  const failedLogins = await auditLog.countDocuments({ action: 'login.failed', createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } });

  res.send(`<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Flowboard Admin</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f6f7fb; color: #0f172a; margin: 0; padding: 24px; }
    h1 { margin-top: 0; }
    h2 { margin-top: 32px; }
    .top { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .logout { background: #fff; border: 1px solid #e3e7ef; border-radius: 10px; padding: 8px 14px; cursor: pointer; font-size: 14px; }
    .cards { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px; }
    .card { background: #fff; border-radius: 12px; padding: 16px 20px; min-width: 120px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    .card b { display: block; font-size: 28px; color: #5b5bf0; }
    .wrap { overflow-x: auto; background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e3e7ef; vertical-align: top; }
    th { background: #5b5bf0; color: #fff; }
    .msg { max-width: 320px; white-space: pre-wrap; }
    .msg-cell { min-width: 240px; max-width: 360px; }
    .time { color: #5b6478; font-size: 13px; white-space: nowrap; }
    td button { border: 0; background: none; cursor: pointer; font-size: 18px; }
    .actions { display: flex; gap: 4px; }
    .empty { text-align: center; color: #5b6478; padding: 24px; }
    .search { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 16px; }
    .search input { flex: 1 1 240px; padding: 10px 14px; border: 1px solid #e3e7ef; border-radius: 10px; font-size: 15px; }
    .search button, .csv { padding: 10px 18px; border: 0; border-radius: 10px; background: #5b5bf0; color: #fff; font-size: 15px; cursor: pointer; text-decoration: none; }
    .csv { background: #10b981; }
    .search a.clear { color: #5b6478; }
    tr.unread td { font-weight: 600; background: #f5f5ff; }
    .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #5b5bf0; margin-right: 6px; vertical-align: middle; }
    tr.disabled td { color: #94a3b8; }
    .badge { font-size: 12px; font-weight: 700; padding: 3px 9px; border-radius: 999px; }
    .badge--on { background: rgba(16,185,129,.14); color: #059669; }
    .badge--off { background: rgba(239,68,68,.14); color: #dc2626; }
    td .small-btn { font-size: 13px; padding: 6px 10px; border: 1px solid #e3e7ef; border-radius: 8px; background: #fff; }
    td .small-btn:hover { border-color: #5b5bf0; }
    .chart-box { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.08); padding: 16px 20px; }
    .legend { display: flex; gap: 16px; font-size: 13px; color: #5b6478; margin-bottom: 20px; }
    .legend span::before { content: ''; display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; background: var(--c); }
    .chart { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; height: 180px; }
    .chart__day { display: grid; grid-template-rows: 1fr auto; gap: 6px; text-align: center; min-width: 0; }
    .chart__day small { color: #5b6478; font-size: 12px; }
    .chart__bars { display: flex; align-items: flex-end; justify-content: center; gap: 4px; border-bottom: 1px solid #e3e7ef; }
    .bar { position: relative; width: min(18px, 40%); min-height: 2px; border-radius: 4px 4px 0 0; }
    .bar i { position: absolute; top: -18px; left: 50%; transform: translateX(-50%); font-style: normal; font-size: 11px; color: #5b6478; }
    .bar--msg { background: #5b5bf0; }
    .bar--user { background: #06b6d4; }
    .bar--view { background: #8b5cf6; }
    .bar--visit { background: #10b981; }
    .chart--30 { grid-template-columns: repeat(30, 1fr); gap: 3px; }
    .chart--30 .bar { width: 45%; }
    .chart--30 small { font-size: 10px; }
    .card small { font-size: 12px; margin-left: 6px; }
    .card small.up { color: #059669; }
    .card small.down { color: #dc2626; }
    .tops { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 12px; }
    .top-box { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.08); padding: 12px 16px; }
    .top-box h3 { margin: 0 0 8px; font-size: 15px; }
    .top-box ol { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; }
    .top-box li { display: flex; justify-content: space-between; gap: 8px; font-size: 14px; }
    .top-box li span { overflow-wrap: anywhere; }
    .top-box .empty { padding: 8px 0; }
    .post-form { display: grid; gap: 8px; max-width: 640px; margin-bottom: 16px; padding: 16px; background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    .post-form input, .post-form textarea { padding: 10px 12px; border: 1px solid #e3e7ef; border-radius: 10px; font: inherit; }
    .post-form button { justify-self: start; padding: 10px 18px; border: 0; border-radius: 10px; background: #5b5bf0; color: #fff; font-size: 15px; cursor: pointer; }
    .post-form select { padding: 10px 12px; border: 1px solid #e3e7ef; border-radius: 10px; font: inherit; }
    .post-form .row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
    .jump { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
    .jump a { padding: 6px 12px; border-radius: 999px; background: #fff; border: 1px solid #e3e7ef; color: #0f172a; text-decoration: none; font-size: 14px; }
    .jump a:hover { border-color: #5b5bf0; }
    .reply { margin-top: 8px; padding: 8px 10px; border-left: 3px solid #10b981; background: #f0fdf8; border-radius: 6px; font-weight: 400; }
    .reply small { color: #059669; font-weight: 600; }
    .reply div { white-space: pre-wrap; margin: 2px 0 4px; }
    .reply a { font-size: 13px; }
    .reply-box { margin-top: 6px; font-weight: 400; }
    .reply-box summary { cursor: pointer; color: #5b5bf0; font-size: 14px; }
    .reply-box form { display: grid; gap: 6px; margin-top: 6px; }
    .reply-box textarea { padding: 8px 10px; border: 1px solid #e3e7ef; border-radius: 8px; font: inherit; min-width: 240px; }
    .reply-box button { justify-self: start; }
    tr.warn td { background: #fff7ed; }
    code { font-size: 13px; background: #eef0f7; padding: 2px 6px; border-radius: 6px; }
    .preview { padding: 10px 14px; border-radius: 10px; font-weight: 600; }
    .preview--info { background: #eef0ff; color: #3730a3; }
    .preview--success { background: #ecfdf5; color: #047857; }
    .preview--warning { background: #fff7ed; color: #c2410c; }
  </style>
</head>
<body>
  <div class="top">
    <h1>📊 Flowboard Admin ☁️</h1>
    <form method="POST" action="/logout"><button class="logout">🚪 Logout</button></form>
  </div>

  <div class="cards">
    <div class="card"><b>${userCount}</b>👤 Users</div>
    <div class="card"><b>${totalMessages}</b>📨 Messages</div>
    <div class="card"><b>${unreadCount}</b>📬 Unread</div>
    <div class="card"><b>${counts.todo}</b>📝 To do</div>
    <div class="card"><b>${counts.doing}</b>⏳ In progress</div>
    <div class="card"><b>${counts.done}</b>✅ Done</div>
    <div class="card"><b>${failedLogins}</b>🚨 Failed logins (24h)</div>
  </div>

  <nav class="jump">
    <a href="#analytics">📊 Analytics</a><a href="#messages">📨 Messages</a><a href="#users">👥 Users</a><a href="#reviews">⭐ Reviews</a>
    <a href="#updates">📰 Updates</a><a href="#banner">📢 Banner</a><a href="#audit">📜 Audit log</a><a href="#health">🩺 Server health</a>
  </nav>

  <h2>📈 Last 7 days</h2>
  <div class="chart-box">
    <div class="legend"><span style="--c:#5b5bf0">Messages</span><span style="--c:#06b6d4">Sign ups</span></div>
    <div class="chart">${chartBars}</div>
  </div>

  <h2 id="analytics">📊 Website analytics (30 days)</h2>
  <div class="cards">
    <div class="card"><b>${stats.today.visitors}${change(stats.today.visitors, stats.yesterday.visitors)}</b>👀 Visitors today</div>
    <div class="card"><b>${stats.today.pageviews}${change(stats.today.pageviews, stats.yesterday.pageviews)}</b>📄 Page views today</div>
    <div class="card"><b>${stats.totalVisits}</b>👥 Visits (30 days)</div>
    <div class="card"><b>${stats.totalPageviews}</b>📄 Page views (30 days)</div>
  </div>
  <div class="chart-box">
    <div class="legend"><span style="--c:#8b5cf6">Page views</span><span style="--c:#10b981">Visitors</span></div>
    <div class="chart chart--30">${statBars}</div>
  </div>
  <div class="tops">
    ${topTable('📄 Top pages', stats.pages, 'No visits yet')}
    ${topTable('🔗 Came from', stats.referrers, 'No referrers yet')}
    ${topTable('🖱️ Events', stats.events, 'No events yet')}
    ${topTable('📱 Devices', stats.devices, 'No visits yet')}
  </div>
  <p class="time">🔒 No cookies and no IP addresses are stored. Visitors are counted per day with a daily-changing hash, and browsers with Do Not Track are skipped.</p>

  <h2 id="messages">📨 Contact messages ${q ? `(${allMessages.length} results for "${escapeHtml(q)}")` : ''}</h2>

  <form class="search" method="GET" action="/admin">
    <input type="search" name="q" value="${escapeHtml(q)}" placeholder="🔍 Search name, email or message…" />
    <button type="submit">Search</button>
    ${q ? '<a class="clear" href="/admin">✕ Clear</a>' : ''}
    <a class="csv" href="/admin/messages.csv">📥 Download CSV</a>
  </form>

  <div class="wrap">
    <table>
      <tr><th>#</th><th>Peru</th><th>Email</th><th>Team</th><th>Message</th><th>Time</th><th></th></tr>
      ${tableRows || `<tr><td colspan="7" class="empty">${q ? 'Onnum kidaikkala 🔍' : 'Innum message illa 📭'}</td></tr>`}
    </table>
  </div>

  <h2 id="users">👥 Users (${userCount})</h2>
  <div class="wrap">
    <table>
      <tr><th>Peru</th><th>Email</th><th>Joined</th><th>Tasks</th><th>Status</th><th></th></tr>
      ${userRows || '<tr><td colspan="6" class="empty">Innum users illa 👤</td></tr>'}
    </table>
  </div>

  <h2 id="reviews">⭐ Reviews ${pendingReviews ? `(${pendingReviews} waiting for approval)` : ''}</h2>
  <div class="wrap">
    <table>
      <tr><th>Rating</th><th>Peru</th><th>Review</th><th>Status</th><th></th></tr>
      ${reviewRows || '<tr><td colspan="5" class="empty">Innum reviews illa ⭐</td></tr>'}
    </table>
  </div>

  <h2 id="updates">📰 Updates (website la "What's new" la varum)</h2>
  <form class="post-form" method="POST" action="/admin/updates">
    <input name="title" placeholder="Title, e.g. New: AI task generator" maxlength="80" required />
    <textarea name="body" rows="3" placeholder="What changed? (1–3 sentences)" maxlength="500" required></textarea>
    <button type="submit">📢 Post update</button>
  </form>
  <div class="wrap">
    <table>
      <tr><th>Date</th><th>Update</th><th></th></tr>
      ${updateRows || '<tr><td colspan="3" class="empty">Innum updates illa 📰</td></tr>'}
    </table>
  </div>

  <h2 id="banner">📢 Site banner (website mele ellaa pages layum varum)</h2>
  <form class="post-form" method="POST" action="/admin/banner">
    ${banner.active && banner.text ? `<div class="preview preview--${escapeHtml(banner.tone)}">🟢 Live now: ${escapeHtml(banner.text)}</div>` : '<div class="time">⚪ Banner ippo off la irukku</div>'}
    <input name="text" value="${escapeHtml(banner.text)}" placeholder="e.g. 🎉 New: Tamil, Sinhala & Hindi languages!" maxlength="160" />
    <div class="row">
      <select name="tone">${toneOptions}</select>
      <label><input type="checkbox" name="active" ${banner.active ? 'checked' : ''} /> Show on website</label>
    </div>
    <button type="submit">💾 Save banner</button>
  </form>

  <h2 id="health">🩺 Server health (server start aanadhula irunthu)</h2>
  <div class="cards">
    <div class="card"><b>${dbHealth.ok ? '🟢' : '🔴'}</b>Database ${dbHealth.ok ? `${dbHealth.ms} ms` : 'DOWN'}</div>
    <div class="card"><b>${fmtUptime(health.uptimeSeconds)}</b>⏱️ Uptime</div>
    <div class="card"><b>${health.requests}</b>📨 Requests</div>
    <div class="card"><b>${(health.errorRate * 100).toFixed(2)}%</b>🔥 Error rate (5xx)</div>
    <div class="card"><b>${health.latencyMs.p50} / ${health.latencyMs.p95} ms</b>⚡ Speed p50 / p95</div>
    <div class="card"><b>${health.memoryMb} MB</b>🧠 Memory</div>
  </div>
  <div class="wrap"><table>
    <tr><th>🐢 Slowest routes</th><th>Requests</th><th>Avg</th><th>Max</th></tr>
    ${routeRows(health.slowestRoutes, true)}
  </table></div>
  <br />
  <div class="wrap"><table>
    <tr><th>🔥 Recent server errors</th><th>Route</th><th>Message</th><th>Request ID</th></tr>
    ${errorRows}
  </table></div>
  <p class="time">JSON: <a href="/api/admin/metrics">/api/admin/metrics</a> · Public check: <a href="/api/health">/api/health</a></p>

  <h2 id="audit">📜 Audit log (kadaisi 40, 90 naal vechukkum)</h2>
  <div class="wrap">
    <table>
      <tr><th>Time</th><th>Action</th><th>Details</th><th>IP</th></tr>
      ${auditRows || '<tr><td colspan="4" class="empty">Innum onnum illa 📜</td></tr>'}
    </table>
  </div>

  <p><a href="/">← Back</a></p>

  <!-- 🛡️ "Delete pannavaa?" confirm: nonce irukkura script mattum oadum (CSP) -->
  <script nonce="${res.locals.nonce}">
    document.addEventListener('submit', (e) => {
      const message = e.target.dataset.confirm;
      if (message && !confirm(message)) e.preventDefault();
    });
  </script>
</body>
</html>`);
});

// 🆕 ✉️ Message ah read ↔ unread maathu
router.post('/admin/messages/:id/toggle-read', requireAdmin, async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (_id) {
    const msg = await messages.findOne({ _id }, { projection: { read: 1 } });
    if (msg) {
      await messages.updateOne({ _id }, { $set: { read: !msg.read } });
      await audit(req, msg.read ? 'message.unread' : 'message.read', `Message ${_id}`);
    }
  }
  res.redirect(adminUrl(req.body?.q));
});

// 🆕 📥 Ellaa messages um CSV file ah download (Excel / Google Sheets la open pannalaam)
router.get('/admin/messages.csv', requireAdmin, async (req, res) => {
  const all = await messages.find().sort({ _id: -1 }).toArray();
  const header = ['Name', 'Email', 'Team', 'Message', 'Read', 'Received'];
  const lines = [
    header.map(csvCell).join(','),
    ...all.map((m) =>
      [m.name, m.email, m.team, m.message, m.read ? 'yes' : 'no', new Date(m.createdAt).toISOString()]
        .map(csvCell)
        .join(',')
    ),
  ];
  await audit(req, 'messages.export', `${all.length} messages downloaded as CSV`); // 🆕 📜
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="flowboard-messages-${dayKey(new Date())}.csv"`);
  res.send('﻿' + lines.join('\r\n')); // ﻿ = Excel ku "ithu UTF-8" nu solla (emoji / Tamil seriyaa varum)
});

// 🆕 🚫 User ah disable ↔ enable (disable pannaa udane logout um aagum)
router.post('/admin/users/:id/toggle-disabled', requireAdmin, async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (_id) {
    const user = await users.findOne({ _id }, { projection: { disabled: 1, email: 1 } });
    if (user) {
      const disabled = !user.disabled;
      await users.updateOne({ _id }, { $set: { disabled } });
      if (disabled) await userSessions.deleteMany({ userId: _id }); // 🚪 ellaa tickets um kizhi
      console.log(disabled ? '🚫 User disabled:' : '✅ User enabled:', user.email);
      await audit(req, disabled ? 'user.disable' : 'user.enable', user.email);
    }
  }
  res.redirect('/admin#users');
});

// 🆕 ⭐ Review approve ↔ hide
router.post('/admin/reviews/:id/toggle', requireAdmin, async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (_id) {
    const review = await reviews.findOne({ _id }, { projection: { approved: 1, name: 1 } });
    if (review) {
      await reviews.updateOne({ _id }, { $set: { approved: !review.approved } });
      await audit(req, review.approved ? 'review.hide' : 'review.approve', `Review by ${review.name}`);
    }
  }
  invalidate('public:reviews'); // ⚡ website la udane theriyanum
  res.redirect('/admin#reviews');
});

// 🆕 ⭐🗑️ Review delete
router.post('/admin/reviews/:id/delete', requireAdmin, async (req, res) => {
  const _id = toObjectId(req.params.id);
  const review = _id && (await reviews.findOneAndDelete({ _id }));
  if (review) await audit(req, 'review.delete', `Review by ${review.name}`);
  invalidate('public:reviews'); // ⚡ website la udane theriyanum
  res.redirect('/admin#reviews');
});

// 🆕 📰 Pudhu update post (admin form)
router.post('/admin/updates', requireAdmin, async (req, res) => {
  const { title, body } = req.body || {};
  if (isText(title) && title.trim() && isText(body) && body.trim()) {
    await updates.insertOne({ title: title.trim().slice(0, 80), body: body.trim().slice(0, 500), createdAt: new Date() });
    console.log('📰 Update posted:', title.trim());
    await audit(req, 'update.post', title.trim().slice(0, 80));
  }
  invalidate('public:updates'); // ⚡ website la udane theriyanum
  res.redirect('/admin#updates');
});

// 🆕 📰🗑️ Update delete
router.post('/admin/updates/:id/delete', requireAdmin, async (req, res) => {
  const _id = toObjectId(req.params.id);
  const update = _id && (await updates.findOneAndDelete({ _id }));
  if (update) await audit(req, 'update.delete', update.title);
  invalidate('public:updates'); // ⚡ website la udane theriyanum
  res.redirect('/admin#updates');
});

// 🆕 ↩️ Message ku reply (save panni read nu mark pannu)
router.post('/admin/messages/:id/reply', requireAdmin, async (req, res) => {
  const _id = toObjectId(req.params.id);
  const { reply } = req.body || {};
  if (_id && isText(reply) && reply.trim()) {
    const msg = await messages.findOneAndUpdate(
      { _id },
      { $set: { reply: { text: reply.trim().slice(0, 2000), at: new Date() }, read: true } }
    );
    if (msg) {
      // 📧 Email setup irundhaa unmaiyaave anuppu (illana "Open in email app" link irukkum)
      const mail = await sendEmail({
        to: msg.email,
        subject: 'Re: your message to Flowboard',
        text: `Hi ${msg.name},\n\n${reply.trim()}\n\n— The Flowboard team\n\nYour message:\n> ${msg.message.replaceAll('\n', '\n> ')}`,
      });
      await messages.updateOne({ _id }, { $set: { 'reply.emailed': mail.sent } });
      await audit(req, 'message.reply', `To ${msg.email}${mail.sent ? ' (emailed)' : ''}`);
    }
  }
  res.redirect(adminUrl(req.body?.q, '#messages'));
});

// 🆕 📢 Site banner save
router.post('/admin/banner', requireAdmin, async (req, res) => {
  const { text, tone, active } = req.body || {};
  const cleanText = isText(text) ? text.trim().slice(0, 160) : '';
  const on = active === 'on' && cleanText.length > 0; // text illaama "on" panna mudiyaadhu
  await settings.updateOne(
    { _id: 'banner' },
    { $set: { text: cleanText, tone: BANNER_TONES.includes(tone) ? tone : 'info', active: on, updatedAt: new Date() } },
    { upsert: true }
  );
  await audit(req, on ? 'banner.on' : 'banner.off', cleanText || '(empty)');
  invalidate('public:banner'); // ⚡ website la udane theriyanum
  res.redirect('/admin#banner');
});

// 🗑️ Admin page la irunthu message delete
router.post('/admin/messages/:id/delete', requireAdmin, async (req, res) => {
  const _id = toObjectId(req.params.id);
  const msg = _id && (await messages.findOneAndDelete({ _id }));
  if (msg) await audit(req, 'message.delete', `From ${msg.email}`);
  console.log('🗑️ Message', req.params.id, 'azhichiduchu');
  res.redirect(adminUrl(req.body?.q)); // 🆕 search la irundhaa athe search ku thirumba
});

// 📒 Ellaa messages um paakka (admin login venum)
router.get('/api/messages', requireAdmin, async (req, res) => {
  const all = await messages.find().sort({ _id: -1 }).toArray();
  res.json(all);
});

export default router;
