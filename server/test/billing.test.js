import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { signUp, startTestServer } from './helpers.js';

// 💳 Billing: Stripe Checkout + webhook (fake Stripe: unmaiyaana panam illa)

let app;
let billing;
let user;
let userId;
const calls = [];
const SECRET = 'whsec_test_secret';

before(async () => {
  app = await startTestServer();
  billing = await import('../lib/billing.ts');
  user = await signUp(app.url, 'Paying Priya');
  userId = String((await app.db.users.findOne({ email: user.email }))._id);
});
after(async () => {
  billing.setStripeFetch(null);
  for (const k of ['STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID', 'STRIPE_WEBHOOK_SECRET']) delete process.env[k];
  await app?.close();
});

function turnOn() {
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  process.env.STRIPE_PRICE_ID = 'price_fake';
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  billing.setStripeFetch(async (path, form, method = 'POST') => {
    calls.push({ path, form, method });
    if (path === '/checkout/sessions') return { url: 'https://checkout.stripe.test/c/pay_123' };
    if (path === '/billing_portal/sessions') return { url: 'https://billing.stripe.test/p/abc' };
    return { id: path };
  });
}

// Stripe maadhiri sign panni anuppu
function sendWebhook(event, { secret = SECRET, time = Math.floor(Date.now() / 1000) } = {}) {
  const raw = JSON.stringify(event);
  const sig = crypto.createHmac('sha256', secret).update(`${time}.${raw}`).digest('hex');
  return fetch(`${app.url}/api/billing/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${time},v1=${sig}` }, body: raw });
}

describe('billing', () => {
  it('reports payments as off without Stripe keys', async () => {
    const info = (await user.client.get('/api/billing')).body;
    assert.equal(info.enabled, false);
    assert.equal(info.plan, 'free');
    assert.equal((await user.client.post('/api/billing/checkout')).status, 503);
    assert.equal((await user.client.get('/api/config')).body.billingEnabled, false);
  });

  it('creates a Stripe Checkout link for the logged-in user', async () => {
    turnOn();
    const res = await user.client.post('/api/billing/checkout');
    assert.equal(res.body.url, 'https://checkout.stripe.test/c/pay_123');
    const sent = calls.at(-1).form;
    assert.equal(sent.client_reference_id, userId);
    assert.equal(sent.customer_email, user.email);
    assert.equal(sent['line_items[0][price]'], 'price_fake');
    assert.equal(sent.mode, 'subscription');
  });

  it('rejects webhooks with a bad or old signature', async () => {
    const event = { type: 'checkout.session.completed', data: { object: { client_reference_id: userId, customer: 'cus_1', subscription: 'sub_1' } } };
    assert.equal((await sendWebhook(event, { secret: 'whsec_wrong' })).status, 400);
    assert.equal((await sendWebhook(event, { time: Math.floor(Date.now() / 1000) - 3600 })).status, 400);
    const unsigned = await fetch(`${app.url}/api/billing/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(event) });
    assert.equal(unsigned.status, 400);
    assert.equal((await user.client.get('/api/billing')).body.plan, 'free', 'still free');
  });

  it('upgrades to Pro after checkout, unlocks limits, and downgrades on cancel', async () => {
    const done = await sendWebhook({ type: 'checkout.session.completed', data: { object: { client_reference_id: userId, customer: 'cus_1', subscription: 'sub_1' } } });
    assert.equal(done.status, 200);
    const info = (await user.client.get('/api/billing')).body;
    assert.equal(info.plan, 'pro');
    assert.equal(info.canManage, true);
    assert.equal((await user.client.get('/api/auth/me')).body.user.plan, 'pro');
    assert.equal((await user.client.post('/api/billing/checkout')).status, 400, 'already Pro');
    assert.equal((await user.client.post('/api/billing/portal')).body.url, 'https://billing.stripe.test/p/abc');

    await sendWebhook({ type: 'customer.subscription.updated', data: { object: { customer: 'cus_1', status: 'past_due' } } });
    assert.equal((await user.client.get('/api/billing')).body.plan, 'pro', 'past_due keeps Pro for now');
    await sendWebhook({ type: 'customer.subscription.deleted', data: { object: { customer: 'cus_1', status: 'canceled' } } });
    const after = (await user.client.get('/api/billing')).body;
    assert.equal(after.plan, 'free');
    assert.equal(after.status, 'canceled');
  });

  it('gives Pro users higher board limits', async () => {
    assert.equal(billing.PLAN_LIMITS.free.boards < billing.PLAN_LIMITS.pro.boards, true);
    await app.db.users.updateOne({ email: user.email }, { $set: { plan: 'free' } });
    const owner = (await app.db.users.findOne({ email: user.email }))._id;
    const extra = Array.from({ length: billing.PLAN_LIMITS.free.boards - 1 }, (_, i) => ({ userId: owner, name: `B${i}`, columns: [], createdAt: new Date() }));
    await app.db.boards.insertMany(extra); // + default board = free limit
    const blocked = await user.client.post('/api/boards', { json: { name: 'One too many' } });
    assert.equal(blocked.status, 400);
    assert.match(blocked.body.error, /Upgrade to Pro/);
    await app.db.users.updateOne({ email: user.email }, { $set: { plan: 'pro' } });
    assert.equal((await user.client.post('/api/boards', { json: { name: 'Pro board' } })).status, 201);
  });

  it('cancels the subscription when a Pro user deletes their account', async () => {
    await app.db.users.updateOne({ email: user.email }, { $set: { plan: 'pro', stripeSubscriptionId: 'sub_1' } });
    const res = await user.client.delete('/api/account', { json: { password: user.password } });
    assert.equal(res.status, 200);
    assert.deepEqual(calls.at(-1), { path: '/subscriptions/sub_1', form: {}, method: 'DELETE' });
  });

  it('checks Stripe signatures correctly', () => {
    const now = Date.now();
    const t = Math.floor(now / 1000);
    const sig = crypto.createHmac('sha256', 's').update(`${t}.body`).digest('hex');
    assert.equal(billing.verifyStripeSignature('body', `t=${t},v1=${sig}`, 's', now), true);
    assert.equal(billing.verifyStripeSignature('body', `t=${t},v1=${sig},v1=other`, 's', now), true, 'any v1 may match');
    assert.equal(billing.verifyStripeSignature('changed', `t=${t},v1=${sig}`, 's', now), false);
    assert.equal(billing.verifyStripeSignature('body', undefined, 's', now), false);
  });
});
