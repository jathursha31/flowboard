import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adminClient, startTestServer } from './helpers.js';

// 📊 Privacy-friendly website analytics

let app;
let lib;
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36';
const PHONE = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36';

before(async () => {
  app = await startTestServer();
  lib = await import('../lib/analytics.ts');
});
after(async () => {
  await app?.close();
});

const track = (json, headers = {}) =>
  fetch(`${app.url}/api/track`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': CHROME, ...headers }, body: JSON.stringify(json) }).then((r) => r.status);

describe('analytics helpers', () => {
  it('cleans paths, referrers and devices', () => {
    assert.equal(lib.cleanPath('/app?board=abc#x'), '/app');
    assert.equal(lib.cleanPath('/boards/6553f1a2b3c4d5e6f7a8b9c0/export'), '/boards/:id/export');
    assert.equal(lib.cleanPath('//evil.com'), null);
    assert.equal(lib.cleanPath('https://x.com/'), null);
    assert.equal(lib.cleanReferrer('https://www.google.com/search?q=flowboard', 'localhost:3001'), 'google.com');
    assert.equal(lib.cleanReferrer('http://localhost:3001/pricing', 'localhost:3001'), null, 'own site is not a referrer');
    assert.equal(lib.cleanReferrer('not a url', 'x'), null);
    assert.equal(lib.deviceOf(PHONE), 'mobile');
    assert.equal(lib.deviceOf(CHROME), 'desktop');
  });
});

describe('POST /api/track', () => {
  it('counts page views without storing the IP or query string', async () => {
    assert.equal(await track({ type: 'pageview', path: '/pricing?ref=mail', referrer: 'https://www.google.com/' }), 204);
    const doc = await app.db.analytics.findOne({});
    assert.equal(doc.path, '/pricing');
    assert.equal(doc.ref, 'google.com');
    assert.equal(doc.device, 'desktop');
    assert.match(doc.visitor, /^[0-9a-f]{16}$/);
    assert.ok(!JSON.stringify(doc).includes('127.0.0.1'), 'no IP stored');
  });

  it('gives the same browser the same visitor id today, and a different browser a new one', async () => {
    await track({ type: 'pageview', path: '/' });
    await track({ type: 'pageview', path: '/' }, { 'user-agent': PHONE });
    const visitors = await app.db.analytics.distinct('visitor');
    assert.equal(visitors.length, 2);
  });

  it('counts allowed events and rejects bad input', async () => {
    assert.equal(await track({ type: 'event', name: 'cta_click', path: '/' }), 204);
    assert.equal(await track({ type: 'event', name: 'hack_the_db', path: '/' }), 400);
    assert.equal(await track({ type: 'pageview', path: 'no-slash' }), 400);
    assert.equal(await track({ type: 'other', path: '/' }), 400);
  });

  it('skips bots, Do Not Track, Global Privacy Control and admin pages', async () => {
    const before = await app.db.analytics.countDocuments();
    assert.equal(await track({ type: 'pageview', path: '/' }, { 'user-agent': 'Googlebot/2.1' }), 204);
    assert.equal(await track({ type: 'pageview', path: '/' }, { dnt: '1' }), 204);
    assert.equal(await track({ type: 'pageview', path: '/' }, { 'sec-gpc': '1' }), 204);
    assert.equal(await track({ type: 'pageview', path: '/admin' }), 204);
    assert.equal(await app.db.analytics.countDocuments(), before);
  });

  it('shows the numbers on the admin page', async () => {
    const admin = await adminClient(app.url);
    const page = (await admin.get('/admin')).body;
    assert.match(page, /Website analytics \(30 days\)/);
    assert.match(page, /<span>\/pricing<\/span><b>1<\/b>/);
    assert.match(page, /<span>google\.com<\/span><b>1<\/b>/);
    assert.match(page, /<span>cta_click<\/span><b>1<\/b>/);
    assert.match(page, /<b>2<\/b>👀 Visitors today/);
  });
});
