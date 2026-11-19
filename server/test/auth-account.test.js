import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeClient, signUp, startTestServer } from './helpers.js';

// 👤 Sign up, login, logout, account (profile, password, stats, delete), rate limit

let app;
before(async () => {
  app = await startTestServer();
});
after(async () => {
  await app?.close();
});

describe('sign up', () => {
  it('rejects a missing name, bad email and short password', async () => {
    const c = makeClient(app.url);
    assert.equal((await c.post('/api/auth/signup', { json: { name: 'A', email: 'a@b.co', password: 'longenough' } })).status, 400);
    assert.equal((await c.post('/api/auth/signup', { json: { name: 'Raju', email: 'not-an-email', password: 'longenough' } })).status, 400);
    assert.equal((await c.post('/api/auth/signup', { json: { name: 'Raju', email: 'r@test.local', password: 'short' } })).status, 400);
    assert.equal((await c.post('/api/auth/signup', { json: { name: { $gt: '' }, email: 'r@test.local', password: 'longenough' } })).status, 400);
  });

  it('creates the account, logs in and never sends the password hash', async () => {
    const c = makeClient(app.url);
    const res = await c.post('/api/auth/signup', { json: { name: ' Raju ', email: 'Raju@Test.Local', password: 'mango-12345' } });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.name, 'Raju');
    assert.equal(res.body.user.email, 'raju@test.local'); // small letters ah save
    assert.equal(JSON.stringify(res.body).includes('passwordHash'), false);
    assert.ok(c.jar.has('user_token'));

    const me = await c.get('/api/auth/me');
    assert.equal(me.body.user.email, 'raju@test.local');
  });

  it('gives a new user "My board" with 5 starter tasks', async () => {
    const { client } = await signUp(app.url);
    const boards = (await client.get('/api/boards')).body;
    assert.equal(boards.length, 1);
    assert.equal(boards[0].name, 'My board');
    const tasks = (await client.get(`/api/tasks?boardId=${boards[0].id}`)).body;
    assert.equal(tasks.length, 5);
  });

  it('blocks a second account with the same email (any letter case)', async () => {
    const c = makeClient(app.url);
    const res = await c.post('/api/auth/signup', { json: { name: 'Copy', email: 'RAJU@test.local', password: 'mango-12345' } });
    assert.equal(res.status, 409);
  });
});

describe('login / logout', () => {
  it('uses the same message for a wrong password and an unknown email', async () => {
    const c = makeClient(app.url);
    const wrongPass = await c.post('/api/auth/login', { json: { email: 'raju@test.local', password: 'wrong-pass' } });
    const noUser = await c.post('/api/auth/login', { json: { email: 'nobody@test.local', password: 'wrong-pass' } });
    assert.equal(wrongPass.status, 401);
    assert.equal(noUser.status, 401);
    assert.equal(wrongPass.body.error, noUser.body.error); // hacker ku clue illa
  });

  it('rejects object payloads (NoSQL injection)', async () => {
    const c = makeClient(app.url);
    const res = await c.post('/api/auth/login', { json: { email: 'raju@test.local', password: { $ne: 'x' } } });
    assert.equal(res.status, 400);
  });

  it('logs in and out', async () => {
    const c = makeClient(app.url);
    assert.equal((await c.post('/api/auth/login', { json: { email: 'raju@test.local', password: 'mango-12345' } })).status, 200);
    assert.ok((await c.get('/api/auth/me')).body.user);
    await c.post('/api/auth/logout');
    assert.equal((await c.get('/api/auth/me')).body.user, null);
  });
});

describe('account', () => {
  it('needs login', async () => {
    const c = makeClient(app.url);
    assert.equal((await c.get('/api/account/stats')).status, 401);
    assert.equal((await c.patch('/api/account', { json: { name: 'X' } })).status, 401);
  });

  it('updates name and avatar colour, rejects unknown colours', async () => {
    const { client } = await signUp(app.url);
    const res = await client.patch('/api/account', { json: { name: 'New Name', avatarColor: '#10b981' } });
    assert.equal(res.status, 200);
    assert.deepEqual([res.body.user.name, res.body.user.avatarColor], ['New Name', '#10b981']);
    assert.equal((await client.patch('/api/account', { json: { avatarColor: 'red; background:url(x)' } })).status, 400);
  });

  it('changes password and logs out other devices', async () => {
    const { client, email, password } = await signUp(app.url);
    const otherDevice = makeClient(app.url);
    await otherDevice.post('/api/auth/login', { json: { email, password } });

    assert.equal((await client.post('/api/account/password', { json: { currentPassword: 'nope-nope', newPassword: 'brand-new-123' } })).status, 401);
    assert.equal((await client.post('/api/account/password', { json: { currentPassword: password, newPassword: 'short' } })).status, 400);
    assert.equal((await client.post('/api/account/password', { json: { currentPassword: password, newPassword: 'brand-new-123' } })).status, 200);

    assert.ok((await client.get('/api/auth/me')).body.user, 'this device stays logged in');
    assert.equal((await otherDevice.get('/api/auth/me')).body.user, null, 'other device is logged out');

    const fresh = makeClient(app.url);
    assert.equal((await fresh.post('/api/auth/login', { json: { email, password } })).status, 401);
    assert.equal((await fresh.post('/api/auth/login', { json: { email, password: 'brand-new-123' } })).status, 200);
  });

  it('returns stats for the starter board', async () => {
    const { client } = await signUp(app.url);
    const stats = (await client.get('/api/account/stats')).body;
    assert.equal(stats.totalTasks, 5);
    assert.equal(stats.done, 1); // "Set up CI pipeline" done column la
    assert.equal(stats.open, 4);
    assert.equal(stats.ownedBoards, 1);
    assert.equal(stats.week.length, 7);
  });

  it('deletes the account with all boards, tasks and review', async () => {
    const { client, email, password } = await signUp(app.url);
    const { _id: userId } = await app.db.users.findOne({ email });
    await client.post('/api/reviews', { json: { rating: 5, text: 'Great app, love it!' } });
    assert.equal(await app.db.reviews.countDocuments({ userId }), 1);

    assert.equal((await client.delete('/api/account', { json: { password: 'wrong-pass' } })).status, 401);
    assert.equal((await client.delete('/api/account', { json: { password } })).status, 200);

    assert.equal(await app.db.users.countDocuments({ _id: userId }), 0);
    assert.equal(await app.db.boards.countDocuments({ userId }), 0);
    assert.equal(await app.db.tasks.countDocuments({ userId }), 0);
    assert.equal(await app.db.reviews.countDocuments({ userId }), 0);
    assert.equal((await makeClient(app.url).post('/api/auth/login', { json: { email, password } })).status, 401);
  });
});

describe('rate limit', () => {
  it('blocks the 11th login attempt in 15 minutes with 429', async () => {
    const { setRateLimitsEnabled, resetRateLimits } = await import('../lib/rateLimit.ts');
    setRateLimitsEnabled(true);
    resetRateLimits();
    try {
      const c = makeClient(app.url);
      const statuses = [];
      for (let i = 0; i < 11; i++) {
        statuses.push((await c.post('/api/auth/login', { json: { email: 'raju@test.local', password: 'wrong-pass' } })).status);
      }
      assert.deepEqual(statuses.slice(0, 10), Array(10).fill(401));
      assert.equal(statuses[10], 429);
    } finally {
      setRateLimitsEnabled(false);
    }
  });
});
