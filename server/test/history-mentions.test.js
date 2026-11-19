import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeClient, signUp, startTestServer } from './helpers.js';

// 🕓 Activity history, 💬 @mentions, 🌅 Plan my day, 📊 task createdAt

let app;
let anu;
let bala;
let boardId;

before(async () => {
  app = await startTestServer();
  anu = await signUp(app.url, 'Anu Raj');
  bala = await signUp(app.url, 'Bala Murugan');
  boardId = (await anu.client.post('/api/boards', { json: { name: 'Shop' } })).body.id;
  await anu.client.post(`/api/boards/${boardId}/members`, { json: { email: bala.email } });
});
after(async () => {
  await app?.close();
});

const history = async (who, taskId) =>
  (await who.client.get(`/api/boards/${boardId}/activity${taskId ? `?taskId=${taskId}` : ''}`)).body;
const notificationsOf = async (who) => (await who.client.get('/api/notifications')).body.items;
const idOf = async (who) => String((await app.db.users.findOne({ email: who.email }))._id);

describe('activity history', () => {
  let taskId;

  it('records create, edit, assign, move, complete, comment and delete with who did it', async () => {
    const task = (await anu.client.post('/api/tasks', { json: { boardId, title: 'Order stock' } })).body;
    taskId = task.id;
    assert.ok(task.createdAt, 'tasks have a createdAt for the timeline');

    await anu.client.patch(`/api/tasks/${taskId}`, { json: { priority: 'high', description: 'From the supplier' } });
    await anu.client.patch(`/api/tasks/${taskId}`, { json: { assigneeId: await idOf(bala) } });
    await bala.client.post('/api/tasks/reorder', { json: { boardId, column: 'doing', ids: [taskId], movedId: taskId } });
    await bala.client.patch(`/api/tasks/${taskId}`, { json: { column: 'done' } });
    await bala.client.post(`/api/tasks/${taskId}/comments`, { json: { text: 'All done!' } });

    const list = await history(anu, taskId);
    const lines = list.map((a) => `${a.actorName} ${a.action} ${a.detail}`.trim()).reverse();
    assert.deepEqual(lines, [
      'Anu Raj created',
      'Anu Raj edited priority, description',
      'Anu Raj assigned Bala Murugan',
      'Bala Murugan moved In progress',
      'Bala Murugan completed Done',
      'Bala Murugan commented All done!',
    ]);
  });

  it('does not log fields that did not really change', async () => {
    const before = (await history(anu, taskId)).length;
    await anu.client.patch(`/api/tasks/${taskId}`, { json: { priority: 'high' } }); // already high
    assert.equal((await history(anu, taskId)).length, before);
  });

  it('keeps the history of deleted tasks on the board feed', async () => {
    await anu.client.delete(`/api/tasks/${taskId}`);
    const feed = await history(anu);
    assert.equal(feed[0].action, 'deleted');
    assert.equal(feed[0].taskTitle, 'Order stock');
  });

  it('is private to people on the board', async () => {
    const stranger = await signUp(app.url, 'Stranger');
    assert.equal((await stranger.client.get(`/api/boards/${boardId}/activity`)).status, 404);
    assert.equal((await makeClient(app.url).get(`/api/boards/${boardId}/activity`)).status, 404);
  });
});

describe('@mentions', () => {
  it('notifies the mentioned teammate once (not twice if also assigned)', async () => {
    const task = (await anu.client.post('/api/tasks', { json: { boardId, title: 'Price list' } })).body;
    await anu.client.patch(`/api/tasks/${task.id}`, { json: { assigneeId: await idOf(bala) } });
    const before = (await notificationsOf(bala)).length;

    await anu.client.post(`/api/tasks/${task.id}/comments`, { json: { text: 'Can you check this @Bala?' } });
    const after = await notificationsOf(bala);
    assert.equal(after.length, before + 1, 'one notification, not mention + comment');
    assert.deepEqual([after[0].type, after[0].text], ['mention', 'Anu Raj mentioned you on "Price list"']);
  });

  it('ignores people who are not on the board and your own name', async () => {
    const outsider = await signUp(app.url, 'Chitra');
    const task = (await anu.client.post('/api/tasks', { json: { boardId, title: 'Banner' } })).body;
    const anuBefore = (await notificationsOf(anu)).length;
    await anu.client.post(`/api/tasks/${task.id}/comments`, { json: { text: '@Chitra @Anu look' } });
    assert.equal((await notificationsOf(outsider)).length, 0);
    assert.equal((await notificationsOf(anu)).length, anuBefore);
  });
});

describe('plan my day (demo mode)', () => {
  it('picks overdue and due-today tasks first, skips done ones and other people’s tasks', async () => {
    const { dayKey } = await import('../lib/helpers.ts');
    const today = dayKey(new Date());
    const lastWeek = dayKey(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const mk = async (title, fields) => {
      const t = (await anu.client.post('/api/tasks', { json: { boardId, title } })).body;
      await anu.client.patch(`/api/tasks/${t.id}`, { json: fields });
      return t.id;
    };
    await mk('Late invoice', { dueDate: lastWeek, priority: 'low' });
    await mk('Call supplier', { dueDate: today });
    await mk('Finished thing', { dueDate: lastWeek, column: 'done' });
    await mk("Bala's job", { dueDate: lastWeek, assigneeId: await idOf(bala) });

    const res = await anu.client.post('/api/ai/plan-day');
    assert.equal(res.status, 200);
    assert.equal(res.body.demo, true);
    const titles = res.body.picks.map((p) => p.task.title);
    assert.equal(titles[0], 'Late invoice');
    assert.equal(titles[1], 'Call supplier');
    assert.ok(!titles.includes('Finished thing'));
    assert.ok(!titles.includes("Bala's job"));
    assert.match(res.body.picks[0].reason, /^Overdue by 7 days/);
  });

  it('needs login', async () => {
    assert.equal((await makeClient(app.url).post('/api/ai/plan-day')).status, 401);
  });
});
