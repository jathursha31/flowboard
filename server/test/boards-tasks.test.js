import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeClient, signUp, startTestServer } from './helpers.js';

// 📋 Boards, tasks, sharing (members), access control, AI demo

let app;
let owner; // board owner (Anu)
let friend; // share panna friend (Bala)
let stranger; // sambandham illaadha aal (Chitra)
let boardId;

before(async () => {
  app = await startTestServer();
  owner = await signUp(app.url, 'Anu');
  friend = await signUp(app.url, 'Bala');
  stranger = await signUp(app.url, 'Chitra');
});
after(async () => {
  await app?.close();
});

const addTask = (who, fields) => who.client.post('/api/tasks', { json: { boardId, ...fields } });
const listTasks = async (who, id = boardId) => (await who.client.get(`/api/tasks?boardId=${id}`)).body;

describe('guest (not logged in)', () => {
  it('sees the public demo board and can add a task to it', async () => {
    const guest = makeClient(app.url);
    const boards = (await guest.get('/api/boards')).body;
    assert.equal(boards[0].name, 'Demo board');
    const res = await guest.post('/api/tasks', { json: { title: 'Guest task' } });
    assert.equal(res.status, 201);
  });

  it('cannot create boards or use AI', async () => {
    const guest = makeClient(app.url);
    assert.equal((await guest.post('/api/boards', { json: { name: 'Mine' } })).status, 401);
    assert.equal((await guest.post('/api/ai/tasks', { json: { goal: 'plan a trip' } })).status, 401);
  });
});

describe('boards', () => {
  it('creates a board with the default columns', async () => {
    const res = await owner.client.post('/api/boards', { json: { name: '  College  ' } });
    assert.equal(res.status, 201);
    assert.equal(res.body.name, 'College');
    assert.deepEqual(res.body.columns.map((c) => c.id), ['todo', 'doing', 'done']);
    assert.equal(res.body.theme, 'default');
    boardId = res.body.id;
  });

  it('rejects an empty board name', async () => {
    assert.equal((await owner.client.post('/api/boards', { json: { name: '   ' } })).status, 400);
  });

  it('changes name and theme, rejects unknown themes', async () => {
    const res = await owner.client.patch(`/api/boards/${boardId}`, { json: { name: 'College work', theme: 'ocean' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.theme, 'ocean');
    assert.equal((await owner.client.patch(`/api/boards/${boardId}`, { json: { theme: 'rainbow' } })).status, 400);
    assert.equal((await owner.client.patch(`/api/boards/${boardId}`, { json: {} })).status, 400);
  });

  it('rejects bad columns (duplicates, bad ids, none)', async () => {
    const bad = [[], [{ id: 'a', title: 'A' }, { id: 'a', title: 'B' }], [{ id: 'Bad Id!', title: 'X' }], [{ id: 'ok', title: '  ' }]];
    for (const columns of bad) {
      assert.equal((await owner.client.patch(`/api/boards/${boardId}`, { json: { columns } })).status, 400, JSON.stringify(columns));
    }
  });

  it('is invisible to strangers', async () => {
    assert.equal((await stranger.client.get(`/api/tasks?boardId=${boardId}`)).status, 404);
    assert.equal((await stranger.client.patch(`/api/boards/${boardId}`, { json: { name: 'Hacked' } })).status, 404);
    assert.equal((await stranger.client.delete(`/api/boards/${boardId}`)).status, 404);
    const theirBoards = (await stranger.client.get('/api/boards')).body;
    assert.ok(!theirBoards.some((b) => b.id === boardId));
  });
});

describe('tasks', () => {
  let taskId;

  it('validates new tasks', async () => {
    assert.equal((await addTask(owner, {})).status, 400);
    assert.equal((await addTask(owner, { title: 'x', column: 'nope' })).status, 400);
    assert.equal((await addTask(owner, { title: 'x', priority: 'super' })).status, 400);
  });

  it('creates a task in the first column with defaults', async () => {
    const res = await addTask(owner, { title: 'Write essay', priority: 'high' });
    assert.equal(res.status, 201);
    assert.equal(res.body.column, 'todo');
    assert.deepEqual([res.body.labels, res.body.checklist, res.body.comments], [[], [], []]);
    taskId = res.body.id;
  });

  it('updates details, labels and checklist', async () => {
    const res = await owner.client.patch(`/api/tasks/${taskId}`, {
      json: { description: 'Two pages', dueDate: '2026-12-01', labels: ['urgent'], checklist: [{ id: 'c1', text: 'Outline', done: false }] },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.dueDate, '2026-12-01');
    assert.deepEqual(res.body.labels, ['urgent']);
    assert.equal(res.body.checklist[0].text, 'Outline');
    assert.equal((await owner.client.patch(`/api/tasks/${taskId}`, { json: { column: 'nowhere' } })).status, 400);
  });

  it('records completion when moved to the last column (stats)', async () => {
    const before = (await owner.client.get('/api/account/stats')).body.thisWeek;
    await owner.client.patch(`/api/tasks/${taskId}`, { json: { column: 'done' } });
    const after = (await owner.client.get('/api/account/stats')).body.thisWeek;
    assert.equal(after, before + 1);
    // veliya eduththaa completion pogum
    await owner.client.patch(`/api/tasks/${taskId}`, { json: { column: 'todo' } });
    assert.equal((await owner.client.get('/api/account/stats')).body.thisWeek, before);
  });

  it('reorders a column and ignores tasks from other boards', async () => {
    const second = (await addTask(owner, { title: 'Read chapter 3' })).body.id;
    const strangerBoard = (await stranger.client.get('/api/boards')).body[0].id;
    const strangerTask = (await listTasks(stranger, strangerBoard))[0];

    const res = await owner.client.post('/api/tasks/reorder', { json: { boardId, column: 'doing', ids: [second, taskId, strangerTask.id] } });
    assert.equal(res.status, 200);

    const doing = (await listTasks(owner)).filter((t) => t.column === 'doing');
    assert.deepEqual(doing.map((t) => t.id), [second, taskId]);
    const untouched = (await listTasks(stranger, strangerBoard)).find((t) => t.id === strangerTask.id);
    assert.equal(untouched.column, strangerTask.column, "stranger's task must not move");
  });

  it('adds and deletes comments with the author name', async () => {
    const res = await owner.client.post(`/api/tasks/${taskId}/comments`, { json: { text: 'Started!' } });
    assert.equal(res.status, 201);
    const comment = res.body.comments.at(-1);
    assert.deepEqual([comment.text, comment.author], ['Started!', 'Anu']);
    assert.equal((await owner.client.post(`/api/tasks/${taskId}/comments`, { json: { text: '  ' } })).status, 400);
    const del = await owner.client.delete(`/api/tasks/${taskId}/comments/${comment.id}`);
    assert.equal(del.body.comments.length, 0);
  });

  it('strangers cannot edit, comment on or delete the task', async () => {
    assert.equal((await stranger.client.patch(`/api/tasks/${taskId}`, { json: { title: 'Hacked' } })).status, 404);
    assert.equal((await stranger.client.post(`/api/tasks/${taskId}/comments`, { json: { text: 'hi' } })).status, 404);
    await stranger.client.delete(`/api/tasks/${taskId}`);
    assert.ok((await listTasks(owner)).some((t) => t.id === taskId), 'task must still exist');
  });

  it('bulk adds 1 to 15 tasks only', async () => {
    assert.equal((await owner.client.post('/api/tasks/bulk', { json: { boardId, tasks: [] } })).status, 400);
    const tooMany = Array.from({ length: 16 }, (_, i) => ({ title: `T${i}` }));
    assert.equal((await owner.client.post('/api/tasks/bulk', { json: { boardId, tasks: tooMany } })).status, 400);
    const res = await owner.client.post('/api/tasks/bulk', { json: { boardId, tasks: [{ title: 'A' }, { title: 'B', priority: 'low' }] } });
    assert.equal(res.status, 201);
    assert.equal(res.body.length, 2);
  });

  it('moves tasks to the first column when their column is deleted', async () => {
    const res = await owner.client.patch(`/api/boards/${boardId}`, { json: { columns: [{ id: 'todo', title: 'To do' }, { id: 'done', title: 'Done' }] } });
    assert.equal(res.status, 200);
    const columns = new Set((await listTasks(owner)).map((t) => t.column));
    assert.ok(!columns.has('doing'));
  });
});

describe('sharing', () => {
  it('validates invites', async () => {
    const url = `/api/boards/${boardId}/members`;
    assert.equal((await owner.client.post(url, { json: { email: 'ghost@test.local' } })).status, 404);
    assert.equal((await owner.client.post(url, { json: { email: owner.email } })).status, 400);
    assert.equal((await owner.client.post(url, { json: { email: 'bad' } })).status, 400);
  });

  it('lets the owner invite a friend who can then use the board', async () => {
    const res = await owner.client.post(`/api/boards/${boardId}/members`, { json: { email: friend.email } });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.members.map((m) => m.name), ['Bala']);

    const shared = (await friend.client.get('/api/boards')).body.find((b) => b.id === boardId);
    assert.deepEqual([shared.role, shared.ownerName], ['member', 'Anu']);
    assert.equal((await addTask(friend, { title: 'Friend task' })).status, 201);
  });

  it('keeps owner-only actions for the owner', async () => {
    assert.equal((await friend.client.patch(`/api/boards/${boardId}`, { json: { name: 'Mine now' } })).status, 404);
    assert.equal((await friend.client.post('/api/tasks/reset', { json: { boardId } })).status, 403);
    assert.equal((await friend.client.delete(`/api/boards/${boardId}`)).status, 404);
    assert.equal((await friend.client.post(`/api/boards/${boardId}/members`, { json: { email: stranger.email } })).status, 404);
  });

  it('owner cannot leave; friend can leave and loses access', async () => {
    assert.equal((await owner.client.delete(`/api/boards/${boardId}/members/me`)).status, 400);
    assert.equal((await friend.client.delete(`/api/boards/${boardId}/members/me`)).status, 200);
    assert.equal((await friend.client.get(`/api/tasks?boardId=${boardId}`)).status, 404);
  });
});

describe('reset and delete', () => {
  it('resets a board to the 5 starter tasks (owner)', async () => {
    const res = await owner.client.post('/api/tasks/reset', { json: { boardId } });
    assert.equal(res.status, 200);
    assert.equal(res.body.tasks.length, 5);
    assert.deepEqual(res.body.board.columns.map((c) => c.id), ['todo', 'doing', 'done']); // default columns thirumba
  });

  it("won't delete the only board, deletes others with their tasks", async () => {
    const { client } = await signUp(app.url);
    const only = (await client.get('/api/boards')).body[0].id;
    assert.equal((await client.delete(`/api/boards/${only}`)).status, 400);

    assert.equal((await owner.client.delete(`/api/boards/${boardId}`)).status, 200);
    const { toObjectId } = await import('../lib/helpers.ts');
    assert.equal(await app.db.tasks.countDocuments({ boardId: toObjectId(boardId) }), 0);
  });
});

describe('AI (demo mode, no API key)', () => {
  it('needs a goal', async () => {
    assert.equal((await owner.client.post('/api/ai/tasks', { json: { goal: 'hi' } })).status, 400);
  });

  it('returns template suggestions marked as demo', async () => {
    const res = await owner.client.post('/api/ai/tasks', { json: { goal: 'Plan a birthday party' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.demo, true);
    assert.ok(res.body.tasks.some((t) => t.title === 'Order the cake'));
  });
});
