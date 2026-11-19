import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeClient, signUp, startTestServer } from './helpers.js';

// ⚡ Real-time (SSE), 👤 assign + 🔔 notifications, ⌨️ search, 🔁 repeat tasks, 📅 reminders

let app;
let anu;
let bala;
let chitra;
let boardId;

before(async () => {
  app = await startTestServer();
  anu = await signUp(app.url, 'Anu');
  bala = await signUp(app.url, 'Bala');
  chitra = await signUp(app.url, 'Chitra');
  boardId = (await anu.client.post('/api/boards', { json: { name: 'Team project' } })).body.id;
  await anu.client.post(`/api/boards/${boardId}/members`, { json: { email: bala.email } });
});
after(async () => {
  await app?.close();
});

const notificationsOf = async (who) => (await who.client.get('/api/notifications')).body;
const userId = async (who) => String((await app.db.users.findOne({ email: who.email }))._id);

// 📡 SSE stream la vara adutha message ah kaathiru
async function openStream(who, id) {
  const controller = new AbortController();
  const res = await fetch(`${app.url}/api/boards/${id}/events`, {
    headers: { cookie: [...who.client.jar].map(([k, v]) => `${k}=${v}`).join('; ') },
    signal: controller.signal,
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  return {
    status: res.status,
    contentType: res.headers.get('content-type'),
    async next(timeoutMs = 5000) {
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        while (true) {
          const match = buffer.match(/data: (.*)\n\n/);
          if (match) {
            buffer = buffer.slice(match.index + match[0].length);
            return JSON.parse(match[1]);
          }
          const { value, done } = await reader.read();
          if (done) return null;
          buffer += decoder.decode(value, { stream: true });
        }
      } finally {
        clearTimeout(timeout);
      }
    },
    close: () => controller.abort(),
  };
}

describe('real-time board (SSE)', () => {
  it('refuses streams for boards you cannot see', async () => {
    const res = await fetch(`${app.url}/api/boards/${boardId}/events`, {
      headers: { cookie: [...chitra.client.jar].map(([k, v]) => `${k}=${v}`).join('; ') },
    });
    assert.equal(res.status, 404);
    await res.body?.cancel();
  });

  it("tells Bala's screen when Anu adds a task, with Anu's tab id", async () => {
    const stream = await openStream(bala, boardId);
    try {
      assert.equal(stream.status, 200);
      assert.match(stream.contentType, /text\/event-stream/);
      const res = await fetch(`${app.url}/api/tasks`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-client-id': 'anu-tab-1',
          cookie: [...anu.client.jar].map(([k, v]) => `${k}=${v}`).join('; '),
        },
        body: JSON.stringify({ boardId, title: 'Live task' }),
      });
      assert.equal(res.status, 201);
      assert.deepEqual(await stream.next(), { type: 'tasks', by: 'anu-tab-1' });
    } finally {
      stream.close();
    }
  });

  it('sends a "board" event when the board settings change', async () => {
    const stream = await openStream(bala, boardId);
    try {
      await anu.client.patch(`/api/boards/${boardId}`, { json: { theme: 'forest' } });
      assert.equal((await stream.next()).type, 'board');
    } finally {
      stream.close();
    }
  });
});

describe('assign + notifications', () => {
  let taskId;

  it('tells Bala that the board was shared with him', async () => {
    const { items, unread } = await notificationsOf(bala);
    assert.ok(unread >= 1);
    assert.equal(items.find((n) => n.type === 'shared').text, 'Anu shared the board "Team project" with you');
  });

  it('only assigns people who are on the board', async () => {
    taskId = (await anu.client.post('/api/tasks', { json: { boardId, title: 'Design logo' } })).body.id;
    const res = await anu.client.patch(`/api/tasks/${taskId}`, { json: { assigneeId: await userId(chitra) } });
    assert.equal(res.status, 400);
    assert.equal((await anu.client.patch(`/api/tasks/${taskId}`, { json: { assigneeId: 'garbage' } })).status, 400);
  });

  it('assigns Bala and notifies him (not Anu)', async () => {
    const before = (await notificationsOf(anu)).items.length;
    const res = await anu.client.patch(`/api/tasks/${taskId}`, { json: { assigneeId: await userId(bala) } });
    assert.equal(res.status, 200);
    assert.equal(res.body.assigneeId, await userId(bala));

    const n = (await notificationsOf(bala)).items[0];
    assert.deepEqual([n.type, n.text, n.taskId, n.boardId], ['assigned', 'Anu assigned you "Design logo"', taskId, boardId]);
    assert.equal((await notificationsOf(anu)).items.length, before, 'no notification for yourself');
  });

  it('notifies the assignee about new comments from others', async () => {
    await anu.client.post(`/api/tasks/${taskId}/comments`, { json: { text: 'Use blue please' } });
    assert.equal((await notificationsOf(bala)).items[0].text, 'Anu commented on "Design logo"');
    const count = (await notificationsOf(bala)).items.length;
    await bala.client.post(`/api/tasks/${taskId}/comments`, { json: { text: 'On it!' } });
    assert.equal((await notificationsOf(bala)).items.length, count, 'own comment = no notification');
  });

  it('marks one or all notifications as read, only your own', async () => {
    const { items } = await notificationsOf(bala);
    await chitra.client.post(`/api/notifications/${items[0].id}/read`); // vera aal: onnum aagaadhu
    assert.equal((await notificationsOf(bala)).items[0].read, false);

    await bala.client.post(`/api/notifications/${items[0].id}/read`);
    assert.equal((await notificationsOf(bala)).items[0].read, true);

    await bala.client.post('/api/notifications/read-all');
    assert.equal((await notificationsOf(bala)).unread, 0);
  });

  it('unassigns tasks when a member leaves the board', async () => {
    await bala.client.delete(`/api/boards/${boardId}/members/me`);
    const task = (await anu.client.get(`/api/tasks?boardId=${boardId}`)).body.find((t) => t.id === taskId);
    assert.equal(task.assigneeId, null);
  });

  it('needs login', async () => {
    assert.equal((await makeClient(app.url).get('/api/notifications')).status, 401);
  });
});

describe('search (Ctrl + K)', () => {
  it('finds tasks across your boards only', async () => {
    await chitra.client.post('/api/tasks', { json: { title: 'Secret logo plan' } }); // Chitra oda board
    const res = (await anu.client.get('/api/search?q=logo')).body;
    assert.deepEqual(res.tasks.map((t) => [t.title, t.boardName]), [['Design logo', 'Team project']]);
    const theirs = (await chitra.client.get('/api/search?q=logo')).body.tasks.map((t) => t.title);
    assert.deepEqual(theirs, ['Secret logo plan'], "Chitra must not find Anu's task");
  });

  it('lists boards and treats regex symbols as plain text', async () => {
    const all = (await anu.client.get('/api/search?q=')).body;
    assert.deepEqual(all.boards.map((b) => b.name), ['My board', 'Team project']);
    assert.deepEqual(all.tasks, []);
    const evil = await anu.client.get(`/api/search?q=${encodeURIComponent('(a+)+$')}`);
    assert.equal(evil.status, 200);
  });
});

describe('repeat tasks', () => {
  it('creates the next weekly copy when moved to done (PATCH)', async () => {
    const created = (await anu.client.post('/api/tasks', { json: { boardId, title: 'Team meeting' } })).body;
    await anu.client.patch(`/api/tasks/${created.id}`, {
      json: { repeat: 'weekly', dueDate: '2026-11-02', checklist: [{ id: 'a', text: 'Agenda', done: true }] },
    });
    await anu.client.patch(`/api/tasks/${created.id}`, { json: { column: 'done' } });

    const meetings = (await anu.client.get(`/api/tasks?boardId=${boardId}`)).body.filter((t) => t.title === 'Team meeting');
    const next = meetings.find((t) => t.id !== created.id);
    const old = meetings.find((t) => t.id === created.id);
    assert.deepEqual([next.column, next.dueDate, next.repeat, next.checklist[0].done], ['todo', '2026-11-09', 'weekly', false]);
    assert.equal(old.repeat, null, 'the finished one stops repeating');

    // done ↔ todo thirumba thirumba pannaalum copy varaadhu
    await anu.client.patch(`/api/tasks/${created.id}`, { json: { column: 'todo' } });
    await anu.client.patch(`/api/tasks/${created.id}`, { json: { column: 'done' } });
    const again = (await anu.client.get(`/api/tasks?boardId=${boardId}`)).body.filter((t) => t.title === 'Team meeting');
    assert.equal(again.length, 2);
  });

  it('reports repeated tasks from drag & drop (reorder)', async () => {
    const t = (await anu.client.post('/api/tasks', { json: { boardId, title: 'Water plants' } })).body;
    await anu.client.patch(`/api/tasks/${t.id}`, { json: { repeat: 'daily' } });
    const res = await anu.client.post('/api/tasks/reorder', { json: { boardId, column: 'done', ids: [t.id], movedId: t.id } });
    assert.equal(res.body.repeated, 1);
  });
});

describe('due date reminders', () => {
  it('reminds the assignee once for tasks due today or tomorrow', async () => {
    const { sendDueReminders } = await import('../lib/notify.ts');
    const { dayKey } = await import('../lib/helpers.ts');
    const today = dayKey(new Date());
    await anu.client.post(`/api/boards/${boardId}/members`, { json: { email: bala.email } });

    const dueToday = (await anu.client.post('/api/tasks', { json: { boardId, title: 'Submit report' } })).body;
    await anu.client.patch(`/api/tasks/${dueToday.id}`, { json: { dueDate: today, assigneeId: await userId(bala) } });
    const finished = (await anu.client.post('/api/tasks', { json: { boardId, title: 'Already finished', column: 'done' } })).body;
    await anu.client.patch(`/api/tasks/${finished.id}`, { json: { dueDate: today } });

    await sendDueReminders();
    const texts = (await notificationsOf(bala)).items.map((n) => n.text);
    assert.ok(texts.includes('📅 "Submit report" is due today'));
    assert.ok(!(await notificationsOf(anu)).items.some((n) => n.text.includes('Already finished')), 'done tasks get no reminder');

    await sendDueReminders();
    const again = (await notificationsOf(bala)).items.filter((n) => n.text === '📅 "Submit report" is due today');
    assert.equal(again.length, 1, 'only one reminder per due date');
  });
});
