import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { signUp, startTestServer } from './helpers.js';

// 🔌 Developer features: API keys + webhooks

let app;
let owner;
let other;
let boardId;
let receiver; // 📮 webhooks vandhu serura chinna local server
const received = [];
let wh; // lib/webhooks.ts (waitForWebhooks, isPrivateIp)

before(async () => {
  process.env.WEBHOOK_ALLOW_PRIVATE = '1'; // test la localhost receiver ku anuppa
  app = await startTestServer();
  wh = await import('../lib/webhooks.ts');
  owner = await signUp(app.url, 'Dev Divya');
  other = await signUp(app.url, 'Other Oscar');
  boardId = (await owner.client.post('/api/boards', { json: { name: 'Hooks board' } })).body.id;

  receiver = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      received.push({ headers: req.headers, raw, body: JSON.parse(raw) });
      res.statusCode = req.url === '/fail' ? 500 : 200;
      res.end('ok');
    });
  });
  await new Promise((resolve) => receiver.listen(0, '127.0.0.1', resolve));
});
after(async () => {
  delete process.env.WEBHOOK_ALLOW_PRIVATE;
  receiver?.close();
  await app?.close();
});

const hookUrl = (path = '/hook') => `http://127.0.0.1:${receiver.address().port}${path}`;
const withKey = (key, method, path, json) =>
  fetch(app.url + path, {
    method,
    headers: { authorization: `Bearer ${key}`, ...(json && { 'content-type': 'application/json' }) },
    body: json && JSON.stringify(json),
  }).then(async (res) => ({ status: res.status, body: await res.json().catch(() => null) }));

describe('API keys', () => {
  let key;
  let keyId;

  it('creates a key, shows it once, and lists only the prefix', async () => {
    const res = await owner.client.post('/api/keys', { json: { name: 'My script' } });
    assert.equal(res.status, 201);
    assert.match(res.body.key, /^fb_[\w-]{32}$/);
    assert.equal(res.body.prefix, res.body.key.slice(0, 11));
    key = res.body.key;
    keyId = res.body.id;

    const list = (await owner.client.get('/api/keys')).body;
    assert.equal(list.length, 1);
    assert.equal(list[0].key, undefined, 'full key never listed');
    assert.equal(list[0].keyHash, undefined);
    const stored = await app.db.apiKeys.findOne({});
    assert.notEqual(stored.keyHash, key, 'only the hash is stored');
  });

  it('needs a name', async () => {
    assert.equal((await owner.client.post('/api/keys', { json: { name: '  ' } })).status, 400);
  });

  it('works as the owner for boards and tasks', async () => {
    const boards = await withKey(key, 'GET', '/api/boards');
    assert.equal(boards.status, 200);
    assert.ok(boards.body.some((b) => b.id === boardId));
    const created = await withKey(key, 'POST', '/api/tasks', { boardId, title: 'Made by a script' });
    assert.equal(created.status, 201);
    const me = await withKey(key, 'GET', '/api/auth/me');
    assert.equal(me.status, 403, 'auth routes are cookie-only');
    assert.ok((await app.db.apiKeys.findOne({})).lastUsedAt, 'last used is recorded');
  });

  it("can't manage keys, webhooks or the account", async () => {
    for (const [method, path] of [
      ['GET', '/api/keys'],
      ['POST', '/api/keys'],
      ['DELETE', '/api/account'],
      ['POST', '/api/account/password'],
      ['GET', `/api/boards/${boardId}/webhooks`],
      ['DELETE', '/api/webhooks/abc'],
    ]) {
      const res = await withKey(key, method, path, method === 'GET' ? undefined : {});
      assert.equal(res.status, 403, `${method} ${path}`);
    }
  });

  it('rejects wrong keys and revoked keys', async () => {
    assert.equal((await withKey('fb_nope', 'GET', '/api/boards')).status, 401);
    assert.equal((await other.client.delete(`/api/keys/${keyId}`)).status, 404, "can't delete someone else's key");
    assert.equal((await owner.client.delete(`/api/keys/${keyId}`)).status, 200);
    assert.equal((await withKey(key, 'GET', '/api/boards')).status, 401);
  });
});

describe('webhooks', () => {
  let hook;

  it('only accepts public https URLs in production mode', async () => {
    delete process.env.WEBHOOK_ALLOW_PRIVATE;
    try {
      for (const url of ['http://example.com/x', 'https://localhost/x', 'https://127.0.0.1/x', 'https://169.254.169.254/latest', 'https://[::1]/x', 'https://10.0.0.5/', 'https://user:pw@example.com/', 'nope']) {
        const res = await owner.client.post(`/api/boards/${boardId}/webhooks`, { json: { url } });
        assert.equal(res.status, 400, url);
      }
    } finally {
      process.env.WEBHOOK_ALLOW_PRIVATE = '1';
    }
    assert.equal(wh.isPrivateIp('192.168.1.4'), true);
    assert.equal(wh.isPrivateIp('::ffff:127.0.0.1'), true);
    assert.equal(wh.isPrivateIp('93.184.216.34'), false);
  });

  it('creates a webhook, shows the secret once, and only the owner can see it', async () => {
    const res = await owner.client.post(`/api/boards/${boardId}/webhooks`, { json: { url: hookUrl(), events: ['task.created', 'task.moved'] } });
    assert.equal(res.status, 201);
    assert.match(res.body.secret, /^whsec_/);
    hook = res.body;

    const list = (await owner.client.get(`/api/boards/${boardId}/webhooks`)).body;
    assert.equal(list.webhooks.length, 1);
    assert.equal(list.webhooks[0].secret, undefined);
    assert.ok(list.events.includes('task.deleted'));

    assert.equal((await other.client.get(`/api/boards/${boardId}/webhooks`)).status, 404);
    assert.equal((await other.client.delete(`/api/webhooks/${hook.id}`)).status, 404);
    assert.equal((await owner.client.post(`/api/boards/${boardId}/webhooks`, { json: { url: hookUrl(), events: ['task.exploded'] } })).status, 400);
  });

  it('sends signed events the hook subscribed to, and skips the rest', async () => {
    received.length = 0;
    const task = (await owner.client.post('/api/tasks', { json: { boardId, title: 'Hooked task' } })).body;
    await owner.client.patch(`/api/tasks/${task.id}`, { json: { title: 'Renamed' } }); // task.edited: not subscribed
    await owner.client.patch(`/api/tasks/${task.id}`, { json: { column: 'doing' } });
    await wh.waitForWebhooks();

    assert.deepEqual(received.map((r) => r.body.event), ['task.created', 'task.moved']);
    const first = received[0];
    assert.equal(first.body.task.id, task.id);
    assert.equal(first.body.board.name, 'Hooks board');
    assert.equal(first.headers['x-flowboard-event'], 'task.created');

    // ✍️ Receiver side check: t=..,v1=HMAC(secret, "t.body")
    const [, t, v1] = first.headers['x-flowboard-signature'].match(/^t=(\d+),v1=([0-9a-f]{64})$/);
    const expected = crypto.createHmac('sha256', hook.secret).update(`${t}.${first.raw}`).digest('hex');
    assert.equal(v1, expected);

    const saved = (await owner.client.get(`/api/boards/${boardId}/webhooks`)).body.webhooks[0];
    assert.equal(saved.deliveries[0].ok, true);
    assert.equal(saved.deliveries[0].status, 200);
  });

  it('sends a test ping and can be switched off', async () => {
    received.length = 0;
    const ping = await owner.client.post(`/api/webhooks/${hook.id}/test`);
    assert.equal(ping.body.ok, true);
    assert.equal(received[0].body.event, 'ping');

    assert.equal((await owner.client.patch(`/api/webhooks/${hook.id}`, { json: { active: false } })).body.active, false);
    received.length = 0;
    await owner.client.post('/api/tasks', { json: { boardId, title: 'Quiet' } });
    await wh.waitForWebhooks();
    assert.equal(received.length, 0, 'inactive hooks get nothing');
  });

  it('turns itself off after 10 failures in a row', async () => {
    const res = await owner.client.post(`/api/boards/${boardId}/webhooks`, { json: { url: hookUrl('/fail') } });
    await app.db.webhooks.updateOne({ url: hookUrl('/fail') }, { $set: { failures: 9 } });
    const { invalidate } = await import('../lib/cache.ts');
    invalidate('webhooks:');
    await owner.client.post('/api/tasks', { json: { boardId, title: 'Boom' } });
    await wh.waitForWebhooks();
    const saved = (await owner.client.get(`/api/boards/${boardId}/webhooks`)).body.webhooks.find((w) => w.id === res.body.id);
    assert.equal(saved.active, false);
    assert.equal(saved.deliveries[0].status, 500);

    const back = await owner.client.patch(`/api/webhooks/${res.body.id}`, { json: { active: true } });
    assert.equal(back.body.failures, 0, 'turning it back on resets the count');
  });

  it('deletes webhooks with their board', async () => {
    await owner.client.delete(`/api/boards/${boardId}`);
    assert.equal(await app.db.webhooks.countDocuments({}), 0);
  });
});

describe('Slack / Discord webhooks', () => {
  it('detects the format from the URL', () => {
    assert.equal(wh.formatFor('https://hooks.slack.com/services/T0/B0/xyz'), 'slack');
    assert.equal(wh.formatFor('https://discord.com/api/webhooks/1/abc'), 'discord');
    assert.equal(wh.formatFor('https://discord.com/channels/1'), 'json');
    assert.equal(wh.formatFor('https://example.com/hook'), 'json');
    assert.equal(wh.formatFor('nope'), 'json');
  });

  it('writes a readable message and strips formatting / mention tricks', () => {
    const data = { actor: { name: 'Anu' }, task: { title: 'Logo <!channel> *bold*' }, board: { name: 'Team' }, detail: 'Done' };
    assert.equal(wh.chatText('task.completed', data, '*'), '*Anu* ✅ completed "Logo !channel bold" → Done · Team');
    assert.equal(wh.chatText('task.created', data, '**'), '**Anu** 🆕 created "Logo !channel bold" · Team');
    assert.match(wh.chatText('ping', {}, '*'), /Flowboard\* is connected/);
  });
});
