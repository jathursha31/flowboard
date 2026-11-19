import express from 'express';
import { requireUser } from '../lib/auth.ts';
import { toObjectId } from '../lib/helpers.ts';
import { users } from '../db.ts';
import { PLAN_LIMITS, billingEnabled, createCheckout, createPortal, planForStatus, planOf, verifyStripeSignature } from '../lib/billing.ts';

// 💳 Billing: en plan, Pro ku upgrade, billing manage, Stripe webhook
const router = express.Router();

const OFF = { error: 'Payments are not set up yet.' };

router.get('/api/billing', requireUser, (req, res) => {
  const user = req.user!;
  res.json({
    enabled: billingEnabled(),
    plan: planOf(user),
    status: user.planStatus ?? null,
    canManage: Boolean(user.stripeCustomerId),
    limits: PLAN_LIMITS,
  });
});

router.post('/api/billing/checkout', requireUser, async (req, res) => {
  if (!billingEnabled()) return res.status(503).json(OFF);
  if (planOf(req.user) === 'pro') return res.status(400).json({ error: 'You are already on Pro.' });
  res.json({ url: await createCheckout(req.user!) });
});

router.post('/api/billing/portal', requireUser, async (req, res) => {
  if (!billingEnabled()) return res.status(503).json(OFF);
  if (!req.user!.stripeCustomerId) return res.status(400).json({ error: 'No billing account yet.' });
  res.json({ url: await createPortal(req.user!) });
});

// 📮 Stripe → namma server: "payment aagiduchu / cancel aagiduchu"
// ⚠️ Raw body venum (signature check ku): app.ts la intha path ku JSON parser illa
router.post('/api/billing/webhook', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json(OFF);
  if (!Buffer.isBuffer(req.body) || !verifyStripeSignature(req.body, req.get('stripe-signature'), secret)) {
    return res.status(400).json({ error: 'Invalid signature.' });
  }
  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch {
    return res.status(400).json({ error: 'Invalid JSON.' });
  }
  const obj = event?.data?.object ?? {};

  if (event.type === 'checkout.session.completed') {
    // client_reference_id = namma user id (checkout create pannumbodhu kuduththom)
    const userId = toObjectId(obj.client_reference_id);
    if (userId) {
      await users.updateOne(
        { _id: userId },
        { $set: { plan: 'pro', planStatus: 'active', stripeCustomerId: String(obj.customer), stripeSubscriptionId: String(obj.subscription) } }
      );
      console.log('💎 Pro upgrade:', String(userId));
    }
  } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const status = event.type === 'customer.subscription.deleted' ? 'canceled' : String(obj.status);
    await users.updateOne({ stripeCustomerId: String(obj.customer) }, { $set: { plan: planForStatus(status), planStatus: status } });
    console.log('💳 Subscription', status, String(obj.customer));
  }
  res.json({ received: true }); // theriyaadha events um 200 (illana Stripe thirumba thirumba anuppum)
});

export default router;
