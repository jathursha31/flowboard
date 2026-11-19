import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeClient, signUp, startTestServer } from './helpers.js';

// 📅 Calendar feed, 🏷️ custom labels, 🗂️ templates, ⏱️ timer, 📊 reports

let app;
let user;
let other;
let boardId;

const day = (offset) => new Date(Date.now() + offset * 86400000).toLocaleDateString('en-CA');

before(async () => {
  app = await startTestServer();
  user = await signUp(app.url, 'Prod Priya');
  other = await signUp(app.url, 'Other Oscar');
  boardId = (await user.client.post('/api/boards', { json: { name: 'Work, stuff; and more' } })).body.id;
});
after(async () => {
  await app?.close();
});

describe('calendar feed', () => {
  let url;

  it('gives a private .ics link with tasks that have due dates', async () => {
    await user.client.post('/api/tasks', { json: { boardId, title: 'Send report, today', dueDate: day(0), priority: 'high' } });
    await user.client.post('/api/tasks', { json: { boardId, title: 'No date task' } });
    url = (await user.client.get('/api/account/calendar')).body.url;
    assert.match(url, /\/api\/calendar\/[\w-]{20,}\.ics$/);
    assert.equal((await user.client.get('/api/account/calendar')).body.url, url, 'same link until reset');

    const res = await fetch(url.replace(/^https?:\/\/[^/]+/, app.url));
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/calendar/);
    const ics = await res.text();
    assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
    assert.match(ics, new RegExp(`DTSTART;VALUE=DATE:${day(0).replaceAll('-', '')}`));
    assert.match(ics, /SUMMARY:🔥 Send report\\, today/, 'commas escaped');
    assert.match(ics, /Board: Work\\, stuff\\; and more/);
    assert.doesNotMatch(ics, /No date task/);
    assert.ok(ics.split('\r\n').every((line) => Buffer.byteLength(line) <= 75), 'lines folded');
  });

  it('stops the old link after reset and hides other people', async () => {
    const fresh = (await user.client.post('/api/account/calendar/reset')).body.url;
    assert.notEqual(fresh, url);
    assert.equal((await fetch(url.replace(/^https?:\/\/[^/]+/, app.url))).status, 404);
    assert.equal((await fetch(`${app.url}/api/calendar/not-a-real-token-123456789.ics`)).status, 404);
    const theirs = (await other.client.get('/api/account/calendar')).body.url;
    const ics = await (await fetch(theirs.replace(/^https?:\/\/[^/]+/, app.url))).text();
    assert.doesNotMatch(ics, /Send report/);
  });
});

describe('custom labels', () => {
  it('starts with the 4 default labels and lets the owner change them', async () => {
    const board = (await user.client.get('/api/boards')).body.find((b) => b.id === boardId);
    assert.deepEqual(board.labels.map((l) => l.id), ['design', 'bug', 'feature', 'urgent']);

    const labels = [
      { id: 'urgent', name: 'Urgent!!', color: 'red' },
      { id: 'client-a', name: 'Client A', color: 'green' },
    ];
    const res = await user.client.patch(`/api/boards/${boardId}`, { json: { labels } });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.labels, labels);
  });

  it('rejects bad labels', async () => {
    for (const labels of [[{ id: 'x', name: 'X', color: 'neon' }], [{ id: 'Bad Id', name: 'X', color: 'red' }], [{ id: 'a', name: ' ', color: 'red' }], [{ id: 'a', name: 'A', color: 'red' }, { id: 'a', name: 'B', color: 'blue' }], Array.from({ length: 13 }, (_, i) => ({ id: `l${i}`, name: `L${i}`, color: 'red' }))]) {
      assert.equal((await user.client.patch(`/api/boards/${boardId}`, { json: { labels } })).status, 400);
    }
  });

  it('keeps only the board labels on tasks, and removes deleted labels from tasks', async () => {
    const task = (await user.client.post('/api/tasks', { json: { boardId, title: 'Labelled', labels: ['client-a', 'design', 'urgent'] } })).body;
    assert.deepEqual(task.labels, ['client-a', 'urgent'], 'design is not on this board any more');
    await user.client.patch(`/api/boards/${boardId}`, { json: { labels: [{ id: 'client-a', name: 'Client A', color: 'green' }] } });
    const tasks = (await user.client.get(`/api/tasks?boardId=${boardId}`)).body;
    assert.deepEqual(tasks.find((t) => t.id === task.id).labels, ['client-a']);
  });
});

describe('templates', () => {
  it('lists templates and creates a ready-made board', async () => {
    const list = (await makeClient(app.url).get('/api/templates')).body;
    const wedding = list.find((t) => t.id === 'wedding');
    assert.ok(wedding && wedding.taskCount > 5);

    const res = await user.client.post('/api/boards', { json: { template: 'wedding' } });
    assert.equal(res.status, 201);
    assert.equal(res.body.name, 'Wedding plan');
    assert.equal(res.body.columns[0].title, 'Ideas');
    assert.ok(res.body.labels.some((l) => l.id === 'venue'));
    const tasks = (await user.client.get(`/api/tasks?boardId=${res.body.id}`)).body;
    assert.equal(tasks.length, wedding.taskCount);
    assert.ok(tasks.every((t) => res.body.columns.some((c) => c.id === t.column)));
    assert.ok(tasks.find((t) => t.title === 'Book the hall').dueDate > day(0));

    const named = await user.client.post('/api/boards', { json: { name: 'My exams', template: 'exam' } });
    assert.equal(named.body.name, 'My exams');
    assert.equal((await user.client.post('/api/boards', { json: { name: 'X', template: 'nope' } })).status, 400);
  });
});

describe('time tracking', () => {
  let a;
  let b;

  it('starts, stops and adds up time', async () => {
    a = (await user.client.post('/api/tasks', { json: { boardId, title: 'Timed A' } })).body;
    b = (await user.client.post('/api/tasks', { json: { boardId, title: 'Timed B' } })).body;
    const started = await user.client.post(`/api/tasks/${a.id}/timer`, { json: { action: 'start' } });
    assert.ok(started.body.timerStartedAt);
    assert.equal((await user.client.post(`/api/tasks/${a.id}/timer`, { json: { action: 'start' } })).status, 409);

    // 90 seconds munnaadi start aana maari
    await app.db.tasks.updateOne({ title: 'Timed A' }, { $set: { timerStartedAt: new Date(Date.now() - 90_000) } });
    const stopped = await user.client.post(`/api/tasks/${a.id}/timer`, { json: { action: 'stop' } });
    assert.equal(stopped.body.timerStartedAt, null);
    assert.ok(stopped.body.timeSpent >= 89 && stopped.body.timeSpent <= 92, String(stopped.body.timeSpent));
    assert.equal((await user.client.post(`/api/tasks/${a.id}/timer`, { json: { action: 'stop' } })).status, 409);
  });

  it('runs one timer per person: starting B stops A', async () => {
    await user.client.post(`/api/tasks/${a.id}/timer`, { json: { action: 'start' } });
    await user.client.post(`/api/tasks/${b.id}/timer`, { json: { action: 'start' } });
    const tasks = (await user.client.get(`/api/tasks?boardId=${boardId}`)).body;
    assert.equal(tasks.find((t) => t.id === a.id).timerStartedAt, null);
    assert.ok(tasks.find((t) => t.id === b.id).timerStartedAt);
  });

  it('resets, validates and blocks strangers', async () => {
    assert.equal((await user.client.post(`/api/tasks/${a.id}/timer`, { json: { action: 'reset' } })).body.timeSpent, 0);
    assert.equal((await user.client.post(`/api/tasks/${a.id}/timer`, { json: { action: 'dance' } })).status, 400);
    assert.equal((await other.client.post(`/api/tasks/${a.id}/timer`, { json: { action: 'start' } })).status, 404);
  });
});

describe('reports', () => {
  it('summarises the last 7 days', async () => {
    await app.db.tasks.updateOne({ title: 'Timed B' }, { $set: { timeSpent: 3600, timerStartedAt: null } });
    const done = (await user.client.post('/api/tasks', { json: { boardId, title: 'Finished thing' } })).body;
    await user.client.patch(`/api/tasks/${done.id}`, { json: { column: 'done' } });

    const report = (await user.client.get('/api/account/report?days=7')).body;
    assert.equal(report.days, 7);
    assert.equal(report.series.length, 7);
    assert.equal(report.series.at(-1).day, day(0));
    assert.ok(report.totals.completed >= 1);
    assert.ok(report.totals.created >= 4);
    assert.ok(report.totals.timeSpent >= 3600);
    assert.equal(report.topTime[0].title, 'Timed B');
    assert.ok(report.byBoard.some((b) => b.name === 'Work, stuff; and more' && b.done >= 1));
    assert.equal((await user.client.get('/api/account/report?days=30')).body.series.length, 30);
    assert.equal((await makeClient(app.url).get('/api/account/report')).status, 401);
  });
});

describe('task links (Google Drive / Docs)', () => {
  let task;

  it('adds Google links with the right kind and a default title', async () => {
    task = (await user.client.post('/api/tasks', { json: { boardId, title: 'With links' } })).body;
    const add = (url, title) => user.client.post(`/api/tasks/${task.id}/links`, { json: { url, title } });
    await add('https://docs.google.com/document/d/abc/edit');
    await add('https://docs.google.com/spreadsheets/d/xyz/edit', 'Budget');
    await add('https://drive.google.com/file/d/123/view');
    const res = await add('https://www.figma.com/file/qq');
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.links.map((l) => [l.kind, l.title]), [
      ['docs', 'Google Doc'],
      ['sheets', 'Budget'],
      ['drive', 'Google Drive file'],
      ['link', 'figma.com'],
    ]);
  });

  it('only accepts https links and blocks strangers', async () => {
    for (const url of ['javascript:alert(1)', 'http://docs.google.com/x', 'not a link', 'https://user:pw@example.com']) {
      assert.equal((await user.client.post(`/api/tasks/${task.id}/links`, { json: { url } })).status, 400, url);
    }
    assert.equal((await other.client.post(`/api/tasks/${task.id}/links`, { json: { url: 'https://example.com' } })).status, 404);
  });

  it('removes a link', async () => {
    const before = (await user.client.get(`/api/tasks?boardId=${boardId}`)).body.find((t) => t.id === task.id);
    const res = await user.client.delete(`/api/tasks/${task.id}/links/${before.links[0].id}`);
    assert.equal(res.body.links.length, 3);
  });
});
