import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeClient, signUp, startTestServer } from './helpers.js';

// 🔔 Push notifications (fake push service: unmaiyaana Google / Apple ku pogaadhu)

let app;
let push;
let owner;
let friend;
const sent = [];
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/device-1';
const sub = (endpoint = ENDPOINT) => ({ endpoint, keys: { p256dh: 'BPublicKeyOfTheBrowser', auth: 'authSecret' } });

before(async () => {
  app = await startTestServer();
  push = await import('../lib/push.ts');
  push.setPushSender(async (target, payload) => {
    if (target.endpoint.endsWith('/gone')) throw Object.assign(new Error('Gone'), { statusCode: 410 });
    sent.push({ endpoint: target.endpoint, ...JSON.parse(payload) });
  });
  owner = await signUp(app.url, 'Owner Omar');
  friend = await signUp(app.url, 'Friend Fathima');
});
after(async () => {
  push.setPushSender(null);
  await app?.close();
});

describe('push notifications', () => {
  it('gives a stable public key', async () => {
    const a = (await makeClient(app.url).get('/api/push/key')).body.publicKey;
    const b = (await makeClient(app.url).get('/api/push/key')).body.publicKey;
    assert.match(a, /^[A-Za-z0-9_-]{80,}$/);
    assert.equal(a, b);
  });

  it('only accepts real push service endpoints (no SSRF)', async () => {
    for (const endpoint of ['http://fcm.googleapis.com/x', 'https://evil.example.com/push', 'https://127.0.0.1/x', 'https://fcm.googleapis.com.evil.com/x']) {
      assert.equal((await friend.client.post('/api/push/subscribe', { json: sub(endpoint) })).status, 400, endpoint);
    }
    assert.equal((await friend.client.post('/api/push/subscribe', { json: { endpoint: ENDPOINT } })).status, 400, 'keys needed');
    assert.equal((await makeClient(app.url).post('/api/push/subscribe', { json: sub() })).status, 401);
  });

  it('sends an alert when someone shares a board with you', async () => {
    assert.equal((await friend.client.post('/api/push/subscribe', { json: sub() })).status, 201);
    assert.equal((await friend.client.get('/api/push/status')).body.devices, 1);
    const boardId = (await owner.client.post('/api/boards', { json: { name: 'Pushy' } })).body.id;
    sent.length = 0;
    await owner.client.post(`/api/boards/${boardId}/members`, { json: { email: friend.email } });
    for (let i = 0; i < 50 && !sent.length; i++) await new Promise((r) => setTimeout(r, 50)); // background la pogum
    assert.equal(sent.length, 1);
    assert.equal(sent[0].endpoint, ENDPOINT);
    assert.match(sent[0].body, /Owner Omar/);
    assert.equal(sent[0].url, `/app?board=${boardId}`);
  });

  it('sends a test alert and removes devices that are gone', async () => {
    await friend.client.post('/api/push/subscribe', { json: sub('https://fcm.googleapis.com/fcm/send/gone') });
    sent.length = 0;
    const res = await friend.client.post('/api/push/test');
    assert.equal(res.body.sent, 1);
    assert.equal(await app.db.pushSubscriptions.countDocuments({ endpoint: /gone$/ }), 0);
  });

  it('unsubscribes', async () => {
    await friend.client.post('/api/push/unsubscribe', { json: { endpoint: ENDPOINT } });
    assert.equal((await friend.client.get('/api/push/status')).body.devices, 0);
  });
});
