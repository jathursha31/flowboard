import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeClient, signUp, startTestServer } from './helpers.js';

// 💬 Board team chat

let app;
let owner;
let viewer;
let stranger;
let boardId;

before(async () => {
  app = await startTestServer();
  owner = await signUp(app.url, 'Owner Olivia');
  viewer = await signUp(app.url, 'Viewer Vani');
  stranger = await signUp(app.url, 'Stranger Sam');
  boardId = (await owner.client.post('/api/boards', { json: { name: 'Chat board' } })).body.id;
  await owner.client.post(`/api/boards/${boardId}/members`, { json: { email: viewer.email, role: 'viewer' } });
});
after(async () => {
  await app?.close();
});

describe('board chat', () => {
  it('lets every board member (viewers too) send and read messages', async () => {
    const sent = await owner.client.post(`/api/boards/${boardId}/chat`, { json: { text: '  Hello team  ' } });
    assert.equal(sent.status, 201);
    assert.equal(sent.body.text, 'Hello team');
    assert.equal(sent.body.name, 'Owner Olivia');
    assert.equal((await viewer.client.post(`/api/boards/${boardId}/chat`, { json: { text: 'Hi!' } })).status, 201);

    const list = (await viewer.client.get(`/api/boards/${boardId}/chat`)).body;
    assert.deepEqual(list.messages.map((m) => m.text), ['Hello team', 'Hi!'], 'oldest first');
    assert.equal(list.hasMore, false);
  });

  it('keeps strangers and guests out', async () => {
    assert.equal((await stranger.client.get(`/api/boards/${boardId}/chat`)).status, 404);
    assert.equal((await stranger.client.post(`/api/boards/${boardId}/chat`, { json: { text: 'let me in' } })).status, 404);
    assert.equal((await makeClient(app.url).get(`/api/boards/${boardId}/chat`)).status, 401);
    const publicBoard = await app.db.boards.findOne({ userId: null });
    assert.equal((await owner.client.post(`/api/boards/${publicBoard._id}/chat`, { json: { text: 'spam' } })).status, 404, 'no chat on the public demo board');
  });

  it('rejects empty, too long and non-text messages', async () => {
    for (const text of ['', '   ', 'x'.repeat(1001), 42]) {
      assert.equal((await owner.client.post(`/api/boards/${boardId}/chat`, { json: { text } })).status, 400);
    }
  });

  it('notifies people mentioned with @', async () => {
    await owner.client.post(`/api/boards/${boardId}/chat`, { json: { text: 'Can you check this @Viewer?' } });
    const bell = (await viewer.client.get('/api/notifications')).body;
    assert.match(bell.items[0].text, /Owner Olivia mentioned you in Chat board chat/);
  });

  it('pages back through older messages', async () => {
    for (let i = 0; i < 52; i++) await app.db.chatMessages.insertOne({ boardId: (await app.db.boards.findOne({ name: 'Chat board' }))._id, userId: (await app.db.users.findOne({ email: owner.email }))._id, name: 'Owner Olivia', avatarColor: '#5b5bf0', text: `old ${i}`, createdAt: new Date() });
    const first = (await owner.client.get(`/api/boards/${boardId}/chat`)).body;
    assert.equal(first.messages.length, 50);
    assert.equal(first.hasMore, true);
    const older = (await owner.client.get(`/api/boards/${boardId}/chat?before=${first.messages[0].id}`)).body;
    assert.equal(older.messages.length, 5);
    assert.equal(older.messages[0].text, 'Hello team');
  });

  it('lets people delete their own messages, and the owner delete any', async () => {
    const mine = (await viewer.client.post(`/api/boards/${boardId}/chat`, { json: { text: 'oops' } })).body;
    const theirs = (await owner.client.post(`/api/boards/${boardId}/chat`, { json: { text: 'owner note' } })).body;
    assert.equal((await viewer.client.delete(`/api/chat/${theirs.id}`)).status, 403);
    assert.equal((await stranger.client.delete(`/api/chat/${mine.id}`)).status, 404);
    assert.equal((await viewer.client.delete(`/api/chat/${mine.id}`)).status, 200);
    const again = (await viewer.client.post(`/api/boards/${boardId}/chat`, { json: { text: 'second try' } })).body;
    assert.equal((await owner.client.delete(`/api/chat/${again.id}`)).status, 200);
  });

  it('removes the chat with its board', async () => {
    await owner.client.delete(`/api/boards/${boardId}`);
    assert.equal(await app.db.chatMessages.countDocuments({}), 0);
  });
});
