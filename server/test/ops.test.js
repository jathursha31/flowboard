import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { adminClient, makeClient, startTestServer } from './helpers.js';

// 🩺 Health, request IDs, error handling, metrics, production static site (Docker mode)

let app;
before(async () => {
  app = await startTestServer();
});
after(async () => {
  await app?.close();
});

describe('health + request IDs', () => {
  it('reports ok with a database ping', async () => {
    const res = await makeClient(app.url).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.database.ok, true);
    assert.equal(typeof res.body.database.ms, 'number');
  });

  it('gives every response a request ID and keeps a safe incoming one', async () => {
    const plain = await fetch(`${app.url}/api/hello`);
    assert.match(plain.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
    const traced = await fetch(`${app.url}/api/hello`, { headers: { 'x-request-id': 'trace-12345678' } });
    assert.equal(traced.headers.get('x-request-id'), 'trace-12345678');
    const evil = await fetch(`${app.url}/api/hello`, { headers: { 'x-request-id': '<script>alert(1)</script>' } });
    assert.notEqual(evil.headers.get('x-request-id'), '<script>alert(1)</script>');
  });

  it('answers unknown API paths with JSON 404', async () => {
    const res = await makeClient(app.url).get('/api/does-not-exist');
    assert.deepEqual([res.status, res.body], [404, { error: 'Not found.' }]);
  });
});

describe('server errors', () => {
  it('hides internals, returns a request ID and shows up in admin metrics', async () => {
    const original = app.db.updates.find;
    app.db.updates.find = () => {
      throw new Error('database exploded');
    };
    let res;
    try {
      res = await makeClient(app.url).get('/api/updates');
    } finally {
      app.db.updates.find = original;
    }
    assert.equal(res.status, 500);
    assert.equal(JSON.stringify(res.body).includes('exploded'), false, 'no internal message to users');
    assert.ok(res.body.requestId);

    const admin = await adminClient(app.url);
    const metrics = (await admin.get('/api/admin/metrics')).body;
    assert.ok(metrics.requests > 0);
    assert.equal(metrics.recentErrors[0].requestId, res.body.requestId);
    assert.equal(metrics.recentErrors[0].message, 'database exploded'); // admin ku mattum
    assert.ok(metrics.byStatus['500'] >= 1);
    assert.match((await admin.get('/admin')).body, /Server health/);
  });

  it('keeps metrics admin-only', async () => {
    assert.equal((await makeClient(app.url).get('/api/admin/metrics')).status, 401);
  });
});

describe('production mode (website served by the API server)', () => {
  let site;
  let close;
  before(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowboard-site-'));
    fs.mkdirSync(path.join(dir, 'assets'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><div id="root">Flowboard SPA</div>');
    fs.writeFileSync(path.join(dir, 'assets', 'index-abc123.js'), 'console.log(1)');
    const { createApp } = await import('../app.ts');
    const server = createApp({ staticDir: dir }).listen(0);
    await new Promise((r) => server.once('listening', r));
    site = `http://127.0.0.1:${server.address().port}`;
    close = () => new Promise((r) => server.close(r));
  });
  after(async () => close?.());

  it('serves the React app for / and client-side routes with the website CSP', async () => {
    for (const p of ['/', '/app', '/account', '/reset-password']) {
      const res = await fetch(site + p);
      assert.equal(res.status, 200, p);
      assert.match(await res.text(), /Flowboard SPA/);
      assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
    }
  });

  it('caches hashed assets for a year but keeps API, admin and 404s as before', async () => {
    const asset = await fetch(`${site}/assets/index-abc123.js`);
    assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.deepEqual(await (await fetch(`${site}/api/hello`)).json(), { message: 'Vanakkam! Kitchen open 👨‍🍳' });
    assert.equal((await fetch(`${site}/admin`, { redirect: 'manual' })).status, 302);
    assert.equal((await fetch(`${site}/api/nope`)).status, 404);
  });
});
