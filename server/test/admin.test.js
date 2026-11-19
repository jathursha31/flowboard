import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adminClient, makeClient, signUp, startTestServer } from './helpers.js';

// 👮 Admin: login + audit log, messages + reply + CSV, reviews, updates, banner, disable user

let app;
let admin;

before(async () => {
  app = await startTestServer();
});
after(async () => {
  await app?.close();
});

const lastAudit = async () => (await app.db.auditLog.find().sort({ _id: -1 }).limit(1).next())?.action;

describe('admin login', () => {
  it('sends guests to the login page', async () => {
    const guest = makeClient(app.url);
    const page = await guest.get('/admin');
    assert.equal(page.status, 302);
    assert.equal(page.location, '/login');
    assert.equal((await guest.get('/api/messages')).status, 401);
  });

  it('rejects a wrong password and writes login.failed to the audit log', async () => {
    const guest = makeClient(app.url);
    const res = await guest.post('/login', { form: { password: 'wrong-password' } });
    assert.equal(res.location, '/login?error=1');
    assert.equal(guest.jar.has('admin_token'), false);
    assert.equal(await lastAudit(), 'login.failed');
  });

  it('logs in with the right password', async () => {
    admin = await adminClient(app.url);
    assert.equal(await lastAudit(), 'login');
    const page = await admin.get('/admin');
    assert.equal(page.status, 200);
    assert.match(page.body, /Flowboard Admin/);
    assert.match(page.body, /Failed logins \(24h\)/);
  });

  it('lets an ADMIN_EMAIL account log in with its website password, and nobody else', async () => {
    const boss = await signUp(app.url, 'Boss Bala');
    const stranger = await signUp(app.url, 'Stranger Sam');
    process.env.ADMIN_EMAIL = ` ${boss.email.toUpperCase()} , other@test.local`;
    try {
      assert.match((await makeClient(app.url).get('/login')).body, /name="email"/);
      const tries = [
        [boss.email, 'wrong-password'],
        [stranger.email, stranger.password], // right password, but not an admin email
        ['other@test.local', boss.password], // admin email with no account
      ];
      for (const [email, password] of tries) {
        const res = await makeClient(app.url).post('/login', { form: { email, password } });
        assert.equal(res.location, '/login?error=1', email);
      }
      const ok = makeClient(app.url);
      const res = await ok.post('/login', { form: { email: boss.email, password: boss.password } });
      assert.equal(res.location, '/admin');
      assert.equal((await ok.get('/admin')).status, 200);
    } finally {
      delete process.env.ADMIN_EMAIL;
    }
    assert.doesNotMatch((await makeClient(app.url).get('/login')).body, /name="email"/, 'no email box without ADMIN_EMAIL');
  });
});

describe('contact messages', () => {
  let user;
  let messageId;

  it('validates the contact form', async () => {
    const guest = makeClient(app.url);
    assert.equal((await guest.post('/api/contact', { json: { name: 'A', email: 'a@b.c', message: 'long enough text' } })).status, 400);
    assert.equal((await guest.post('/api/contact', { json: { name: 'Anon', email: 'nope', message: 'long enough text' } })).status, 400);
    assert.equal((await guest.post('/api/contact', { json: { name: 'Anon', email: 'a@b.c', message: 'short' } })).status, 400);
  });

  it('escapes HTML from messages on the admin page (XSS)', async () => {
    user = await signUp(app.url, 'Mala');
    await user.client.post('/api/contact', { json: { name: 'Mala', email: user.email, message: '<script>alert("hacked")</script> please help' } });
    const page = (await admin.get('/admin')).body;
    assert.equal(page.includes('<script>alert("hacked")</script>'), false);
    assert.ok(page.includes('&lt;script&gt;alert(&quot;hacked&quot;)&lt;/script&gt;'));
    messageId = (await app.db.messages.findOne({ email: user.email }))._id.toString();
  });

  it('shows the admin reply on the user account page', async () => {
    assert.equal((await user.client.get('/api/account/messages')).body[0].reply, null);
    const res = await admin.post(`/admin/messages/${messageId}/reply`, { form: { reply: 'Hi Mala, here is the answer.' } });
    assert.equal(res.location, '/admin#messages');
    assert.equal(await lastAudit(), 'message.reply');

    const inbox = (await user.client.get('/api/account/messages')).body;
    assert.equal(inbox[0].reply.text, 'Hi Mala, here is the answer.');
    const msg = await app.db.messages.findOne({ email: user.email });
    assert.equal(msg.read, true);
  });

  it('does not let other users see the message', async () => {
    const other = await signUp(app.url);
    assert.deepEqual((await other.client.get('/api/account/messages')).body, []);
  });

  it('blocks replies without admin login', async () => {
    const guest = makeClient(app.url);
    const res = await guest.post(`/admin/messages/${messageId}/reply`, { form: { reply: 'hacked' } });
    assert.equal(res.location, '/login');
  });

  it('exports CSV with formula injection blocked', async () => {
    await makeClient(app.url).post('/api/contact', { json: { name: 'Evil', email: 'e@test.local', message: '=HYPERLINK("http://evil")' } });
    const res = await admin.get('/admin/messages.csv');
    assert.match(res.headers.get('content-type'), /text\/csv/);
    assert.ok(res.body.includes(`"'=HYPERLINK(""http://evil"")"`));
    assert.equal(await lastAudit(), 'messages.export');
  });
});

describe('reviews', () => {
  let user;

  it('validates and keeps new reviews pending', async () => {
    user = await signUp(app.url, 'Kavi');
    assert.equal((await user.client.post('/api/reviews', { json: { rating: 6, text: 'Ten letters plus' } })).status, 400);
    assert.equal((await user.client.post('/api/reviews', { json: { rating: 5, text: 'short' } })).status, 400);
    assert.equal((await user.client.post('/api/reviews', { json: { rating: 5, text: 'Love the AI planner!' } })).status, 200);
    assert.equal((await user.client.get('/api/reviews/mine')).body.review.approved, false);
    assert.deepEqual((await makeClient(app.url).get('/api/reviews')).body, []);
  });

  it('shows the review publicly after approval and hides it again', async () => {
    const review = await app.db.reviews.findOne({ name: 'Kavi' });
    await admin.post(`/admin/reviews/${review._id}/toggle`);
    assert.equal(await lastAudit(), 'review.approve');
    const list = (await makeClient(app.url).get('/api/reviews')).body;
    assert.deepEqual([list.length, list[0].name, list[0].rating], [1, 'Kavi', 5]);

    await admin.post(`/admin/reviews/${review._id}/toggle`);
    assert.deepEqual((await makeClient(app.url).get('/api/reviews')).body, []);
  });

  it('needs approval again after the user edits it', async () => {
    const review = await app.db.reviews.findOne({ name: 'Kavi' });
    await admin.post(`/admin/reviews/${review._id}/toggle`); // approve
    await user.client.post('/api/reviews', { json: { rating: 1, text: 'Changed my mind, spam spam' } });
    assert.deepEqual((await makeClient(app.url).get('/api/reviews')).body, []);
  });
});

describe('updates', () => {
  it('posts and deletes "What\'s new" updates', async () => {
    await admin.post('/admin/updates', { form: { title: 'New: themes', body: 'Pick a colour for each board.' } });
    assert.equal(await lastAudit(), 'update.post');
    const list = (await makeClient(app.url).get('/api/updates')).body;
    assert.equal(list[0].title, 'New: themes');

    await admin.post(`/admin/updates/${list[0].id}/delete`);
    assert.deepEqual((await makeClient(app.url).get('/api/updates')).body, []);
  });
});

describe('site banner', () => {
  it('is off by default', async () => {
    assert.deepEqual((await makeClient(app.url).get('/api/banner')).body, { banner: null });
  });

  it('turns on, falls back to the info tone and cannot be on without text', async () => {
    await admin.post('/admin/banner', { form: { text: '🎉 Big news', tone: 'warning', active: 'on' } });
    let banner = (await makeClient(app.url).get('/api/banner')).body.banner;
    assert.deepEqual([banner.text, banner.tone], ['🎉 Big news', 'warning']);
    assert.equal(await lastAudit(), 'banner.on');

    await admin.post('/admin/banner', { form: { text: 'Hello', tone: 'evil', active: 'on' } });
    banner = (await makeClient(app.url).get('/api/banner')).body.banner;
    assert.equal(banner.tone, 'info');

    await admin.post('/admin/banner', { form: { text: '', tone: 'info', active: 'on' } });
    assert.equal((await makeClient(app.url).get('/api/banner')).body.banner, null);
  });
});

describe('disable user', () => {
  it('logs the user out, blocks login, and enable lets them back', async () => {
    const user = await signUp(app.url, 'Ravi');
    const { _id } = await app.db.users.findOne({ email: user.email });

    await admin.post(`/admin/users/${_id}/toggle-disabled`);
    assert.equal(await lastAudit(), 'user.disable');
    assert.equal((await user.client.get('/api/auth/me')).body.user, null);
    const login = await makeClient(app.url).post('/api/auth/login', { json: { email: user.email, password: user.password } });
    assert.equal(login.status, 403);

    await admin.post(`/admin/users/${_id}/toggle-disabled`);
    const again = await makeClient(app.url).post('/api/auth/login', { json: { email: user.email, password: user.password } });
    assert.equal(again.status, 200);
  });
});

describe('admin logout', () => {
  it('ends the admin session', async () => {
    await admin.post('/logout');
    assert.equal(await lastAudit(), 'logout');
    assert.equal((await admin.get('/admin')).location, '/login');
  });
});

describe('security headers', () => {
  it('sends strict headers and no "X-Powered-By"', async () => {
    const res = await makeClient(app.url).get('/api/hello');
    assert.equal(res.headers.get('x-powered-by'), null);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.match(res.headers.get('permissions-policy'), /camera=\(\)/);
  });

  it('runs only the admin script with the matching nonce (no inline handlers)', async () => {
    const admin = await adminClient(app.url);
    const page = await admin.get('/admin');
    const nonce = page.headers.get('content-security-policy').match(/'nonce-([^']+)'/)[1];
    assert.ok(page.body.includes(`<script nonce="${nonce}">`));
    assert.equal(/\son(submit|click|load)=/i.test(page.body), false, 'no inline event handlers');
    const again = await admin.get('/admin');
    assert.notEqual(again.headers.get('content-security-policy'), page.headers.get('content-security-policy'), 'new nonce every time');
  });
});
