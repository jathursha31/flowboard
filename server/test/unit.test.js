import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adminUrl, csvCell, escapeHtml, escapeRegex, isText, mailtoLink, toObjectId } from '../lib/helpers.ts';
import { cleanTaskFields, nextDueDate, toTask } from '../lib/boards.ts';
import { demoSuggestions } from '../lib/ai.ts';
import { rateLimit, resetRateLimits, setRateLimitsEnabled } from '../lib/rateLimit.ts';
import { checkPassword, hashPassword } from '../lib/auth.ts';

// 🧩 Unit tests: chinna functions, database theva illa (vegamaa oadum)

describe('helpers', () => {
  it('escapeHtml makes HTML safe (XSS)', () => {
    assert.equal(escapeHtml(`<script>alert("x")</script> & 'y'`), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;');
    assert.equal(escapeHtml(null), '');
  });

  it('csvCell quotes cells and blocks formulas (CSV injection)', () => {
    assert.equal(csvCell('hello'), '"hello"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(csvCell('=HYPERLINK("evil")'), `"'=HYPERLINK(""evil"")"`);
    assert.equal(csvCell('+1'), `"'+1"`);
    assert.equal(csvCell('-1'), `"'-1"`);
    assert.equal(csvCell('@SUM(A1)'), `"'@SUM(A1)"`);
  });

  it('escapeRegex turns regex symbols into plain text (ReDoS)', () => {
    const evil = '(a+)+$';
    assert.ok(new RegExp(escapeRegex(evil)).test('xx(a+)+$xx'));
    assert.ok(!new RegExp(escapeRegex('a.c')).test('abc'));
  });

  it('isText only accepts strings (NoSQL injection guard)', () => {
    assert.equal(isText('hi'), true);
    assert.equal(isText({ $gt: '' }), false);
    assert.equal(isText(['a']), false);
    assert.equal(isText(undefined), false);
  });

  it('toObjectId returns null for bad ids', () => {
    assert.equal(toObjectId('nope'), null);
    assert.equal(toObjectId('6adca1e581768a8119a61cae').toString(), '6adca1e581768a8119a61cae');
  });

  it('mailtoLink keeps @ and encodes the body', () => {
    const link = mailtoLink('a@b.com', 'Hi & bye');
    assert.ok(link.startsWith('mailto:a@b.com?subject='));
    assert.ok(link.includes('body=Hi%20%26%20bye'));
  });

  it('adminUrl keeps the search and hash', () => {
    assert.equal(adminUrl('', '#users'), '/admin#users');
    assert.equal(adminUrl(' raju ', '#messages'), '/admin?q=raju#messages');
    assert.equal(adminUrl({ $ne: 1 }), '/admin');
  });
});

describe('cleanTaskFields', () => {
  it('requires a title when creating', () => {
    assert.equal(cleanTaskFields({}, { requireTitle: true }).error, 'Task title is required.');
    assert.equal(cleanTaskFields({ title: '   ' }, { requireTitle: true }).error, 'Task title is required.');
  });

  it('trims and limits the title to 80 characters', () => {
    const { fields } = cleanTaskFields({ title: `  ${'x'.repeat(100)}  ` }, { requireTitle: true });
    assert.equal(fields.title.length, 80);
  });

  it('rejects bad priority, date, labels and checklist', () => {
    assert.ok(cleanTaskFields({ priority: 'urgent!!' }, { requireTitle: false }).error);
    assert.ok(cleanTaskFields({ dueDate: '2026-13-45' }, { requireTitle: false }).error);
    assert.ok(cleanTaskFields({ dueDate: 'tomorrow' }, { requireTitle: false }).error);
    assert.ok(cleanTaskFields({ labels: ['bug', 'Not An Id!'] }, { requireTitle: false }).error); // 🏷️ id format (board la irukkaa nu route paakkum)
    assert.ok(cleanTaskFields({ labels: 'bug' }, { requireTitle: false }).error);
    assert.ok(cleanTaskFields({ checklist: [{ id: '1', text: '', done: false }] }, { requireTitle: false }).error);
    assert.ok(cleanTaskFields({ checklist: Array.from({ length: 31 }, (_, i) => ({ id: `${i}`, text: 'x', done: false })) }, { requireTitle: false }).error);
  });

  it('accepts good values and removes duplicate labels', () => {
    const { fields, error } = cleanTaskFields(
      { priority: 'high', dueDate: '2026-11-01', labels: ['bug', 'bug', 'design'], checklist: [{ id: 'a', text: ' Buy cake ', done: true }] },
      { requireTitle: false }
    );
    assert.equal(error, undefined);
    assert.deepEqual(fields, { priority: 'high', dueDate: '2026-11-01', labels: ['bug', 'design'], checklist: [{ id: 'a', text: 'Buy cake', done: true }] });
  });
});

describe('nextDueDate (repeat tasks)', () => {
  it('adds a day, a week or a month', () => {
    assert.equal(nextDueDate('2026-10-24', 'daily'), '2026-10-25');
    assert.equal(nextDueDate('2026-10-24', 'weekly'), '2026-10-31');
    assert.equal(nextDueDate('2026-10-24', 'monthly'), '2026-11-24');
    assert.equal(nextDueDate('2026-12-31', 'daily'), '2027-01-01');
  });

  it('uses the last day when the next month is shorter', () => {
    assert.equal(nextDueDate('2026-01-31', 'monthly'), '2026-02-28');
    assert.equal(nextDueDate('2026-03-31', 'monthly'), '2026-04-30');
  });

  it('rejects unknown repeat values', () => {
    assert.ok(cleanTaskFields({ repeat: 'yearly' }, { requireTitle: false }).error);
    assert.deepEqual(cleanTaskFields({ repeat: null }, { requireTitle: false }).fields, { repeat: null });
  });
});

describe('toTask', () => {
  it('fills defaults for old tasks that miss new fields', () => {
    const task = toTask({ _id: toObjectId('6adca1e581768a8119a61cae'), title: 'Old', priority: 'low', column: 'todo' });
    assert.deepEqual(task, {
      id: '6adca1e581768a8119a61cae',
      title: 'Old',
      priority: 'low',
      column: 'todo',
      order: 0,
      description: '',
      dueDate: null,
      labels: [],
      checklist: [],
      assigneeId: null,
      repeat: null,
      createdAt: toObjectId('6adca1e581768a8119a61cae').getTimestamp(),
      timeSpent: 0,
      timerStartedAt: null,
      links: [],
      attachments: [],
      comments: [],
    });
  });
});

describe('demoSuggestions (AI demo mode)', () => {
  it('picks the birthday template from keywords', () => {
    const list = demoSuggestions('Plan my sister birthday party');
    assert.ok(list.some((t) => t.title === 'Order the cake'));
    assert.ok(list.every((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate)));
  });

  it('falls back to a general plan for unknown goals', () => {
    const list = demoSuggestions('Learn the violin');
    assert.equal(list.length, 6);
    assert.ok(list[0].title.includes('Learn the violin'));
  });
});

describe('rateLimit', () => {
  it('blocks after max requests with 429', () => {
    setRateLimitsEnabled(true);
    resetRateLimits();
    const limiter = rateLimit({ windowMs: 60_000, max: 2, message: 'Slow down' });
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      let status = 200;
      const res = {
        set() {},
        status(code) {
          status = code;
          return this;
        },
        json() {},
      };
      limiter({ ip: '1.2.3.4', originalUrl: '/api/x' }, res, () => {});
      statuses.push(status);
    }
    assert.deepEqual(statuses, [200, 200, 429]);
  });
});

describe('passwords', () => {
  it('hashes with a random salt and checks correctly', async () => {
    const a = await hashPassword('secret-123');
    const b = await hashPassword('secret-123');
    assert.match(a, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
    assert.notEqual(a, b); // ore password, vera vera hash (salt)
    assert.equal(await checkPassword('secret-123', a), true);
    assert.equal(await checkPassword('wrong', a), false);
  });
});

describe('API docs (OpenAPI)', () => {
  it('documents every /api route in the code', async () => {
    const { createApp } = await import('../app.ts');
    const { openApiSpec } = await import('../lib/openapi.ts');
    const routes = [];
    const walk = (stack) => {
      for (const layer of stack) {
        if (layer.route) for (const m of Object.keys(layer.route.methods)) routes.push([m, layer.route.path]);
        else if (layer.handle?.stack) walk(layer.handle.stack);
      }
    };
    walk(createApp().router.stack);

    const internal = ['/api/hello', '/api/messages', '/api/docs', '/api/openapi.json', '/api/admin/metrics', '/api/cron/reminders']; // test / admin-only / docs page itself
    const missing = routes
      .filter(([, path]) => path.startsWith('/api/') && !internal.includes(path))
      .map(([method, path]) => [method, path.replace(/:(\w+)/g, '{$1}')])
      .filter(([method, path]) => !openApiSpec.paths[path]?.[method])
      .map(([method, path]) => `${method.toUpperCase()} ${path}`);
    assert.deepEqual(missing, [], 'add these to lib/openapi.js');
  });
});

describe('@mentions', () => {
  it('finds people by first name or full name, in any script', async () => {
    const { findMentioned, mentionTokens } = await import('../lib/mentions.ts');
    const people = [{ _id: 1, name: 'Bala Murugan' }, { _id: 2, name: 'Anu' }, { _id: 3, name: 'கவி' }];
    assert.deepEqual(findMentioned('hey @bala and @BalaMurugan, ping @கவி', people).map((p) => p._id), [1, 3]);
    assert.deepEqual(findMentioned('email me at anu@test.local', people), [], 'emails are not mentions');
    assert.deepEqual(mentionTokens('@a too short, @Ok fine'), ['ok']);
  });
});

describe('planDayHeuristic', () => {
  it('puts overdue, then due today, then high priority first', async () => {
    const { planDayHeuristic } = await import('../lib/planDay.ts');
    const base = { boardId: 'b', boardName: 'B', assignedToMe: false };
    const picks = planDayHeuristic(
      [
        { ...base, id: 'later', title: 'Later', priority: 'high', dueDate: '2026-12-30' },
        { ...base, id: 'today', title: 'Today', priority: 'low', dueDate: '2026-10-24' },
        { ...base, id: 'late', title: 'Late', priority: 'low', dueDate: '2026-10-20' },
        { ...base, id: 'none', title: 'No date', priority: 'medium', dueDate: null },
      ],
      new Date('2026-10-24T09:00')
    );
    assert.deepEqual(picks.map((p) => p.task.id), ['late', 'today', 'later']);
    assert.equal(picks[0].reason, 'Overdue by 4 days');
    assert.equal(picks[1].reason, 'Due today');
  });
});
