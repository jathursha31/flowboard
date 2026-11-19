import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeClient, signUp, startTestServer } from './helpers.js';

// 📦 Export (JSON + CSV) and import (Flowboard backup + Trello)

let app;
let user;
let boardId;

before(async () => {
  app = await startTestServer();
  user = await signUp(app.url, 'Data Dev');
  boardId = (await user.client.get('/api/boards')).body[0].id;
  const t = (await user.client.post('/api/tasks', { json: { boardId, title: '=SUM(A1) sneaky' } })).body;
  await user.client.patch(`/api/tasks/${t.id}`, { json: { labels: ['bug'], dueDate: '2026-12-01', checklist: [{ id: 'a', text: 'Step', done: true }] } });
});
after(async () => {
  await app?.close();
});

const importJson = (who, data) => who.client.post('/api/import', { json: data });

describe('export', () => {
  it('downloads all my boards and tasks as a JSON backup', async () => {
    const res = await user.client.get('/api/account/export');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition'), /attachment; filename="flowboard-export-\d{4}-\d{2}-\d{2}\.json"/);
    assert.equal(res.body.format, 'flowboard-export');
    assert.equal(res.body.boards.length, 1);
    const task = res.body.boards[0].tasks.find((t) => t.title.startsWith('=SUM'));
    assert.deepEqual([task.labels, task.dueDate, task.checklist], [['bug'], '2026-12-01', [{ text: 'Step', done: true }]]);
    assert.equal(JSON.stringify(res.body).includes('passwordHash'), false);
  });

  it('exports a board as CSV with formula injection blocked', async () => {
    const res = await user.client.get(`/api/boards/${boardId}/export.csv`);
    assert.match(res.headers.get('content-type'), /text\/csv/);
    assert.ok(res.body.includes(`"'=SUM(A1) sneaky"`));
    assert.ok(res.body.includes('"1/1"'), 'checklist progress');
  });

  it('keeps exports private', async () => {
    const stranger = await signUp(app.url, 'Stranger');
    assert.equal((await stranger.client.get(`/api/boards/${boardId}/export.csv`)).status, 404);
    assert.equal((await makeClient(app.url).get('/api/account/export')).status, 401);
  });
});

describe('import', () => {
  it('restores a Flowboard backup into a new account (round trip)', async () => {
    const backup = (await user.client.get('/api/account/export')).body;
    const other = await signUp(app.url, 'New Laptop');
    const res = await importJson(other, backup);
    assert.equal(res.status, 201);
    assert.equal(res.body.format, 'flowboard');
    const imported = (await other.client.get('/api/boards')).body.find((b) => b.id === res.body.boards[0].id);
    const list = (await other.client.get(`/api/tasks?boardId=${imported.id}`)).body;
    assert.equal(list.length, 6); // 5 starter + 1
    const task = list.find((t) => t.title.startsWith('=SUM'));
    assert.deepEqual([task.labels, task.dueDate, task.checklist[0].done], [['bug'], '2026-12-01', true]);
  });

  it('imports a Trello export: open lists become columns, cards become tasks', async () => {
    const trello = {
      name: 'Wedding plan',
      lists: [
        { id: 'L1', name: 'Ideas', closed: false },
        { id: 'L2', name: 'Doing', closed: false },
        { id: 'L3', name: 'Old stuff', closed: true },
      ],
      cards: [
        { name: 'Book hall', desc: 'Near the temple', idList: 'L2', due: '2026-11-20T10:00:00.000Z', labels: [{ name: 'Urgent', color: 'red' }], idChecklists: ['C1'], closed: false },
        { name: 'Pick colours', idList: 'L1', labels: [{ name: '', color: 'purple' }], closed: false },
        { name: 'Archived card', idList: 'L1', closed: true },
      ],
      checklists: [{ id: 'C1', checkItems: [{ name: 'Call owner', state: 'complete' }, { name: 'Pay deposit', state: 'incomplete' }] }],
    };
    const res = await importJson(user, trello);
    assert.deepEqual([res.status, res.body.format, res.body.boards[0].name, res.body.boards[0].tasks], [201, 'trello', 'Wedding plan', 2]);
    const board = (await user.client.get('/api/boards')).body.find((b) => b.name === 'Wedding plan');
    assert.deepEqual(board.columns.map((c) => c.title), ['Ideas', 'Doing']);
    const list = (await user.client.get(`/api/tasks?boardId=${board.id}`)).body;
    const hall = list.find((t) => t.title === 'Book hall');
    assert.deepEqual(
      [hall.column, hall.priority, hall.dueDate, hall.labels, hall.checklist.map((i) => [i.text, i.done])],
      ['doing', 'high', '2026-11-20', ['urgent'], [['Call owner', true], ['Pay deposit', false]]]
    );
    assert.deepEqual(list.find((t) => t.title === 'Pick colours').labels, ['design']);
  });

  it('rejects unknown files and cleans hostile values', async () => {
    assert.equal((await importJson(user, { hello: 'world' })).status, 400);
    const res = await importJson(user, {
      boards: [{ name: 'X'.repeat(200), columns: [{ id: 'a', title: '<b>Col</b>' }], tasks: [{ title: { $ne: 1 } }, { title: 'Ok', priority: 'mega', labels: ['bug', 'evil'] }] }],
    });
    assert.equal(res.status, 201);
    const board = (await user.client.get('/api/boards')).body.find((b) => b.id === res.body.boards[0].id);
    assert.equal(board.name.length, 40);
    const [task] = (await user.client.get(`/api/tasks?boardId=${board.id}`)).body;
    assert.deepEqual([task.title, task.priority, task.labels], ['Ok', 'medium', ['bug']]);
  });

  it('accepts files up to 5 MB but not more', async () => {
    const big = { boards: [{ name: 'Big', columns: [], tasks: [{ title: 'x', description: 'y'.repeat(6 * 1024 * 1024) }] }] };
    assert.equal((await importJson(user, big)).status, 413);
  });

  it('needs login', async () => {
    assert.equal((await importJson({ client: makeClient(app.url) }, { boards: [] })).status, 401);
  });
});
