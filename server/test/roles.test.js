import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { signUp, startTestServer } from './helpers.js';

// 👀 Roles: owner / editor / viewer (paakka mattum)

let app;
let owner;
let editor;
let viewer;
let boardId;
let taskId;

before(async () => {
  app = await startTestServer();
  owner = await signUp(app.url, 'Owner Olivia');
  editor = await signUp(app.url, 'Editor Eli');
  viewer = await signUp(app.url, 'Viewer Vani');
  boardId = (await owner.client.post('/api/boards', { json: { name: 'Roles board' } })).body.id;
  await owner.client.post(`/api/boards/${boardId}/members`, { json: { email: editor.email } });
  await owner.client.post(`/api/boards/${boardId}/members`, { json: { email: viewer.email, role: 'viewer' } });
  taskId = (await owner.client.post('/api/tasks', { json: { boardId, title: 'Shared task' } })).body.id;
});
after(async () => {
  await app?.close();
});

const idOf = async (who) => String((await app.db.users.findOne({ email: who.email }))._id);
const boardFor = async (who) => (await who.client.get('/api/boards')).body.find((b) => b.id === boardId);

describe('roles', () => {
  it('shows each person their access and lists member roles', async () => {
    assert.equal((await boardFor(owner)).access, 'owner');
    assert.equal((await boardFor(editor)).access, 'editor');
    assert.equal((await boardFor(viewer)).access, 'viewer');
    const people = (await owner.client.get(`/api/boards/${boardId}/members`)).body;
    assert.equal(people.owner.role, 'owner');
    assert.deepEqual(people.members.map((m) => [m.name, m.role]).sort(), [['Editor Eli', 'editor'], ['Viewer Vani', 'viewer']]);
  });

  it('lets viewers read but blocks every change with 403', async () => {
    assert.equal((await viewer.client.get(`/api/tasks?boardId=${boardId}`)).status, 200);
    const attempts = [
      viewer.client.post('/api/tasks', { json: { boardId, title: 'Sneaky' } }),
      viewer.client.post('/api/tasks/bulk', { json: { boardId, tasks: [{ title: 'Sneaky' }] } }),
      viewer.client.patch(`/api/tasks/${taskId}`, { json: { title: 'Hacked' } }),
      viewer.client.post('/api/tasks/reorder', { json: { boardId, column: 'done', ids: [taskId], movedId: taskId } }),
      viewer.client.post(`/api/tasks/${taskId}/comments`, { json: { text: 'hi' } }),
      viewer.client.delete(`/api/tasks/${taskId}`),
      fetch(`${app.url}/api/tasks/${taskId}/attachments`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain', cookie: [...viewer.client.jar].map(([k, v]) => `${k}=${v}`).join('; ') },
        body: 'hello',
      }).then((r) => ({ status: r.status })),
    ];
    const statuses = (await Promise.all(attempts)).map((r) => r.status);
    assert.deepEqual(statuses, Array(7).fill(403));
    const task = (await owner.client.get(`/api/tasks?boardId=${boardId}`)).body.find((t) => t.id === taskId);
    assert.equal(task.title, 'Shared task');
  });

  it('lets editors change tasks but not board settings', async () => {
    assert.equal((await editor.client.patch(`/api/tasks/${taskId}`, { json: { priority: 'high' } })).status, 200);
    assert.equal((await editor.client.post(`/api/tasks/${taskId}/comments`, { json: { text: 'On it' } })).status, 201);
    assert.equal((await editor.client.patch(`/api/boards/${boardId}`, { json: { name: 'Mine' } })).status, 404);
    assert.equal((await editor.client.patch(`/api/boards/${boardId}/members/${await idOf(viewer)}`, { json: { role: 'editor' } })).status, 404);
  });

  it('owner can promote a viewer to editor (and back)', async () => {
    const res = await owner.client.patch(`/api/boards/${boardId}/members/${await idOf(viewer)}`, { json: { role: 'editor' } });
    assert.equal(res.status, 200);
    assert.equal((await viewer.client.post('/api/tasks', { json: { boardId, title: 'Now allowed' } })).status, 201);

    await owner.client.patch(`/api/boards/${boardId}/members/${await idOf(viewer)}`, { json: { role: 'viewer' } });
    assert.equal((await viewer.client.post('/api/tasks', { json: { boardId, title: 'Blocked again' } })).status, 403);
    assert.equal((await owner.client.patch(`/api/boards/${boardId}/members/${await idOf(viewer)}`, { json: { role: 'boss' } })).status, 400);
  });

  it('removes the viewer flag when someone leaves', async () => {
    await viewer.client.delete(`/api/boards/${boardId}/members/me`);
    const board = await app.db.boards.findOne({ name: 'Roles board' });
    assert.equal((board.viewers ?? []).length, 0);
  });
});
