import crypto from 'node:crypto';
import type { User } from '../types.ts';

// 💳 Payments (Stripe): Pro plan subscription
// Stripe package theva illa: avanga REST API ku fetch. Keys server/.env la mattum:
//   STRIPE_SECRET_KEY=sk_test_...   (test mode la mudhalla! sk_live_ apram thaan)
//   STRIPE_PRICE_ID=price_...       (Stripe dashboard la Pro plan ku create panna price)
//   STRIPE_WEBHOOK_SECRET=whsec_... (Stripe "payment aagiduchu" nu namakku sollum webhook)
// Keys illana payments "off": website "coming soon" kaattum, vera ethuvum udaiyaadhu.

export type Plan = 'free' | 'pro';

// 💎 Pro ku kidaikkuradhu (server la check pannurom: website la mattum illa)
export const PLAN_LIMITS: Record<Plan, { boards: number; members: number; aiPerHour: number }> = {
  free: { boards: 20, members: 10, aiPerHour: 10 },
  pro: { boards: 100, members: 50, aiPerHour: 100 },
};

export const planOf = (user: Pick<User, 'plan'> | null | undefined): Plan => (user?.plan === 'pro' ? 'pro' : 'free');
export const limitsFor = (user: Pick<User, 'plan'> | null | undefined) => PLAN_LIMITS[planOf(user)];

export function billingEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID && process.env.STRIPE_WEBHOOK_SECRET);
}

// 🧪 Tests la fake Stripe podalaam (unmaiyaana Stripe ku call pogaama)
type StripeFetch = (path: string, form: Record<string, string>, method?: 'POST' | 'DELETE') => Promise<Record<string, any>>;
async function askStripe(path: string, form: Record<string, string>, method: 'POST' | 'DELETE' = 'POST'): Promise<Record<string, any>> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Stripe error ${res.status}`);
  return data;
}
let stripe: StripeFetch = askStripe;
export function setStripeFetch(fn: StripeFetch | null): void {
  stripe = fn ?? askStripe;
}

const appUrl = () => (process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, '');

// 🛒 Stripe Checkout page link (card details Stripe page la thaan type pannuvaanga: namma server ku card number varave varaadhu)
export async function createCheckout(user: User): Promise<string> {
  const form: Record<string, string> = {
    mode: 'subscription',
    'line_items[0][price]': process.env.STRIPE_PRICE_ID!,
    'line_items[0][quantity]': '1',
    client_reference_id: String(user._id),
    success_url: `${appUrl()}/account?upgraded=1#plan`,
    cancel_url: `${appUrl()}/account#plan`,
    allow_promotion_codes: 'true',
  };
  if (user.stripeCustomerId) form.customer = user.stripeCustomerId;
  else form.customer_email = user.email;
  const session = await stripe('/checkout/sessions', form);
  return session.url;
}

// 🧾 "Manage billing": card maathu, cancel, invoices (Stripe oda page)
export async function createPortal(user: User): Promise<string> {
  const session = await stripe('/billing_portal/sessions', { customer: user.stripeCustomerId!, return_url: `${appUrl()}/account#plan` });
  return session.url;
}

// 🗑️ Account delete pannaa subscription um niruththu (illana Stripe kaasu vaangikitte irukkum!)
export async function cancelSubscription(subscriptionId: string): Promise<void> {
  await stripe(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {}, 'DELETE');
}

// ✍️ Stripe webhook signature: "t=123,v1=abc" → HMAC-SHA256(secret, "t.body"). 5 nimisham ku mela pazhasu na reject
export function verifyStripeSignature(rawBody: Buffer | string, header: string | undefined, secret: string, now = Date.now()): boolean {
  if (!header) return false;
  const parts = header.split(',').map((p) => p.split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !sigs.length || Math.abs(now / 1000 - Number(t)) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody.toString()}`).digest('hex');
  return sigs.some((sig) => sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
}

// Subscription status → plan (trialing / active / past_due = innum Pro; cancel / unpaid = Free)
export const planForStatus = (status: unknown): Plan => (['active', 'trialing', 'past_due'].includes(String(status)) ? 'pro' : 'free');
