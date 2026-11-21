import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adminClient, makeClient, signUp, startTestServer } from './helpers.js';

// 🔑 Forgot password, 🔵 Google login, 📎 attachments, 📧 admin reply email (dev mode)

let app;
let email;
const CLIENT_ID = 'test-client.apps.googleusercontent.com';

before(async () => {
  delete process.env.RESEND_API_KEY; // 📧 dev mode: emails devOutbox la
  process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
  app = await startTestServer();
  email = await import('../lib/email.ts');
});
after(async () => {
  delete process.env.GOOGLE_CLIENT_ID;
  (await import('../lib/google.ts')).setGoogleVerifier(null);
  await app?.close();
});

const lastEmailTo = (to) => [...email.devOutbox].reverse().find((m) => m.to === to);
const tokenFrom = (mail) => mail.text.match(/token=([0-9a-f]{64})/)[1];

describe('config', () => {
  it('tells the website which optional features are on', async () => {
    const res = (await makeClient(app.url).get('/api/config')).body;
    assert.deepEqual(res, { googleClientId: CLIENT_ID, emailEnabled: false, billingEnabled: false, live: 'sse' });
  });
});

describe('forgot / reset password', () => {
  it('answers the same for unknown emails (no account leak) and sends nothing', async () => {
    const before = email.devOutbox.length;
    const res = await makeClient(app.url).post('/api/auth/forgot', { json: { email: 'nobody@test.local' } });
    assert.deepEqual([res.status, res.body], [200, { ok: true }]);
    assert.equal(email.devOutbox.length, before);
  });

  it('emails a one-time link that sets a new password and logs out other devices', async () => {
    const user = await signUp(app.url, 'Forgetful');
    await makeClient(app.url).post('/api/auth/forgot', { json: { email: user.email.toUpperCase() } });
    const mail = lastEmailTo(user.email);
    assert.equal(mail.subject, 'Reset your Flowboard password');
    const token = tokenFrom(mail);

    const resetter = makeClient(app.url);
    assert.equal((await resetter.post('/api/auth/reset', { json: { token, password: 'short' } })).status, 400);
    const ok = await resetter.post('/api/auth/reset', { json: { token, password: 'my-new-password-1' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.email, user.email);
    assert.ok(resetter.jar.has('user_token'), 'logged in after reset');

    assert.equal((await user.client.get('/api/auth/me')).body.user, null, 'old device logged out');
    assert.equal((await resetter.post('/api/auth/reset', { json: { token, password: 'again-password-2' } })).status, 400, 'link works once');
    const login = await makeClient(app.url).post('/api/auth/login', { json: { email: user.email, password: 'my-new-password-1' } });
    assert.equal(login.status, 200);
  });

  it('rejects fake and expired tokens', async () => {
    const c = makeClient(app.url);
    assert.equal((await c.post('/api/auth/reset', { json: { token: 'abc', password: 'whatever-123' } })).status, 400);
    assert.equal((await c.post('/api/auth/reset', { json: { token: 'a'.repeat(64), password: 'whatever-123' } })).status, 400);

    const user = await signUp(app.url);
    await c.post('/api/auth/forgot', { json: { email: user.email } });
    const token = tokenFrom(lastEmailTo(user.email));
    await app.db.passwordResets.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } }); // ⏰ time over
    assert.equal((await c.post('/api/auth/reset', { json: { token, password: 'whatever-123' } })).status, 400);
  });
});

describe('Google sign-in', () => {
  const fakeGoogle = (overrides = {}) => async (credential) => ({
    aud: CLIENT_ID,
    iss: 'https://accounts.google.com',
    email_verified: 'true',
    exp: String(Math.floor(Date.now() / 1000) + 3600),
    sub: `google-${credential}`,
    email: `${credential}@gmail.test`,
    name: 'Google Person',
    ...overrides,
  });

  it('creates a new account with a starter board and no password', async () => {
    const { setGoogleVerifier } = await import('../lib/google.ts');
    setGoogleVerifier(fakeGoogle());
    const c = makeClient(app.url);
    const res = await c.post('/api/auth/google', { json: { credential: 'newbie' } });
    assert.equal(res.status, 200);
    assert.deepEqual([res.body.user.email, res.body.user.hasPassword], ['newbie@gmail.test', false]);
    assert.equal((await c.get('/api/boards')).body[0].name, 'My board');
    // password illaadha account ku password login vela seiyaadhu (crash um aagaadhu)
    assert.equal((await makeClient(app.url).post('/api/auth/login', { json: { email: 'newbie@gmail.test', password: 'anything-123' } })).status, 401);
  });

  it('lets a Google user set a password, and delete by typing their email', async () => {
    const c = makeClient(app.url);
    await c.post('/api/auth/google', { json: { credential: 'setter' } });
    assert.equal((await c.post('/api/account/password', { json: { newPassword: 'first-password-1' } })).status, 200);
    assert.equal((await c.get('/api/auth/me')).body.user.hasPassword, true);

    const d = makeClient(app.url);
    await d.post('/api/auth/google', { json: { credential: 'leaver' } });
    assert.equal((await d.delete('/api/account', { json: { confirmEmail: 'wrong@gmail.test' } })).status, 401);
    assert.equal((await d.delete('/api/account', { json: { confirmEmail: 'LEAVER@gmail.test' } })).status, 200);
  });

  it('links to an existing account with the same email', async () => {
    const user = await signUp(app.url, 'Both Ways');
    const { setGoogleVerifier } = await import('../lib/google.ts');
    setGoogleVerifier(fakeGoogle({ email: user.email, sub: 'google-both' }));
    const res = await makeClient(app.url).post('/api/auth/google', { json: { credential: 'x' } });
    assert.equal(res.body.user.name, 'Both Ways');
    assert.equal((await app.db.users.findOne({ email: user.email })).googleId, 'google-both');
  });

  it('rejects tokens for another app, unverified emails and expired tokens', async () => {
    const { setGoogleVerifier } = await import('../lib/google.ts');
    for (const bad of [{ aud: 'someone-else' }, { email_verified: 'false' }, { exp: '1000' }, { iss: 'evil.com' }]) {
      setGoogleVerifier(fakeGoogle(bad));
      assert.equal((await makeClient(app.url).post('/api/auth/google', { json: { credential: 'bad' } })).status, 401, JSON.stringify(bad));
    }
    setGoogleVerifier(async () => null); // Google "thappu token" sonnaa
    assert.equal((await makeClient(app.url).post('/api/auth/google', { json: { credential: 'forged' } })).status, 401);
  });

  it('is off (503) when GOOGLE_CLIENT_ID is not set', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    try {
      assert.equal((await makeClient(app.url).post('/api/auth/google', { json: { credential: 'x' } })).status, 503);
      assert.equal((await makeClient(app.url).get('/api/config')).body.googleClientId, null);
    } finally {
      process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
    }
  });
});

describe('attachments', () => {
  let owner;
  let stranger;
  let taskId;
  let fileId;
  // 1x1 PNG
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const cookie = (who) => [...who.client.jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const upload = (who, id, body, type = 'image/png', name = 'logo.png') =>
    fetch(`${app.url}/api/tasks/${id}/attachments`, {
      method: 'POST',
      headers: { 'content-type': type, 'x-file-name': encodeURIComponent(name), cookie: cookie(who) },
      body,
    });

  before(async () => {
    owner = await signUp(app.url, 'Uploader');
    stranger = await signUp(app.url, 'Stranger');
    const boardId = (await owner.client.get('/api/boards')).body[0].id;
    taskId = (await owner.client.get(`/api/tasks?boardId=${boardId}`)).body[0].id;
  });

  it('uploads an image and lists it on the task', async () => {
    const res = await upload(owner, taskId, png, 'image/png', 'my "logo"\n.png');
    assert.equal(res.status, 201);
    const task = await res.json();
    assert.equal(task.attachments.length, 1);
    assert.deepEqual([task.attachments[0].name, task.attachments[0].size, task.attachments[0].type], ['my _logo__.png', png.length, 'image/png']);
    fileId = task.attachments[0].id;
  });

  it('downloads it safely (right type, nosniff), only for people with access', async () => {
    const res = await fetch(`${app.url}/api/attachments/${fileId}`, { headers: { cookie: cookie(owner) } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), png);

    const theirs = await fetch(`${app.url}/api/attachments/${fileId}`, { headers: { cookie: cookie(stranger) } });
    assert.equal(theirs.status, 404);
    assert.equal((await upload(stranger, taskId, png)).status, 404);
  });

  it('blocks dangerous types, big files and too many files', async () => {
    assert.equal((await upload(owner, taskId, Buffer.from('<svg onload=alert(1)>'), 'image/svg+xml', 'x.svg')).status, 415);
    assert.equal((await upload(owner, taskId, Buffer.from('<script>'), 'text/html', 'x.html')).status, 415);
    assert.equal((await upload(owner, taskId, Buffer.alloc(2 * 1024 * 1024 + 1), 'image/png')).status, 413);
    for (let i = 0; i < 4; i++) assert.equal((await upload(owner, taskId, png)).status, 201);
    assert.equal((await upload(owner, taskId, png)).status, 400, '6th file');
  });

  it('deletes one file, and all files when the task is deleted', async () => {
    const res = await owner.client.delete(`/api/tasks/${taskId}/attachments/${fileId}`);
    assert.equal(res.body.attachments.length, 4);
    assert.equal((await fetch(`${app.url}/api/attachments/${fileId}`, { headers: { cookie: cookie(owner) } })).status, 404);

    const { toObjectId } = await import('../lib/helpers.ts');
    await owner.client.delete(`/api/tasks/${taskId}`);
    assert.equal(await app.db.files.find({ 'metadata.taskId': toObjectId(taskId) }).toArray().then((l) => l.length), 0);
  });
});

describe('admin reply email (dev mode)', () => {
  it('"sends" the reply to the person who wrote in', async () => {
    const admin = await adminClient(app.url);
    await makeClient(app.url).post('/api/contact', { json: { name: 'Visitor', email: 'visitor@test.local', message: 'How much is Pro?' } });
    const msg = await app.db.messages.findOne({ email: 'visitor@test.local' });
    await admin.post(`/admin/messages/${msg._id}/reply`, { form: { reply: 'Pro is $12 per user.' } });
    const mail = lastEmailTo('visitor@test.local');
    assert.equal(mail.subject, 'Re: your message to Flowboard');
    assert.ok(mail.text.includes('Pro is $12 per user.'));
    assert.ok(mail.text.includes('> How much is Pro?'));
  });
});
