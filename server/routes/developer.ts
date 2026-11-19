import express from 'express';
import { isText, toObjectId } from '../lib/helpers.ts';
import { requireUser } from '../lib/auth.ts';
import { findMyBoard } from '../lib/boards.ts';
import { apiKeys, webhooks } from '../db.ts';
import { MAX_API_KEYS, generateApiKey, toApiKey } from '../lib/apiKeys.ts';
import { MAX_WEBHOOKS_PER_BOARD, WEBHOOK_EVENTS, checkWebhookUrl, deliver, newWebhookSecret, toWebhook } from '../lib/webhooks.ts';
import { invalidate } from '../lib/cache.ts';
import { webhookTestLimit } from '../lib/rateLimit.ts';
import type { WebhookDoc } from '../types.ts';

// 🔌 Developers: personal API keys + board webhooks
// (API key la intha routes ah thoda mudiyaadhu: lib/apiKeys.ts KEY_BLOCKED. Website la login aagi thaan)
const router = express.Router();

// 🔑 En API keys (full key illa: prefix mattum)
router.get('/api/keys', requireUser, async (req, res) => {
  const list = await apiKeys.find({ userId: req.user!._id }).sort({ _id: -1 }).toArray();
  res.json(list.map(toApiKey));
});

// ➕ Pudhu key: full key ore oru thadavai mattum badhil la varum
router.post('/api/keys', requireUser, async (req, res) => {
  const name = isText(req.body?.name) ? req.body.name.trim().slice(0, 40) : '';
  if (!name) return res.status(400).json({ error: 'Give the key a name, like "My script".' });
  if ((await apiKeys.countDocuments({ userId: req.user!._id })) >= MAX_API_KEYS) {
    return res.status(400).json({ error: `You can have up to ${MAX_API_KEYS} keys. Delete one first.` });
  }
  const { key, keyHash, prefix } = generateApiKey();
  const doc = { userId: req.user!._id, name, keyHash, prefix, createdAt: new Date(), lastUsedAt: null };
  const result = await apiKeys.insertOne(doc);
  console.log('🔑 API key created:', prefix);
  res.status(201).json({ ...toApiKey({ _id: result.insertedId, ...doc }), key });
});

// 🗑️ Key ah thookku (udane vela seiyaadhu)
router.delete('/api/keys/:id', requireUser, async (req, res) => {
  const id = toObjectId(req.params.id);
  const result = id ? await apiKeys.deleteOne({ _id: id, userId: req.user!._id }) : { deletedCount: 0 };
  if (!result.deletedCount) return res.status(404).json({ error: 'Key not found.' });
  res.json({ ok: true });
});

// 🪝 Board oda webhooks (owner mattum)
router.get('/api/boards/:id/webhooks', requireUser, async (req, res) => {
  const board = await findMyBoard(req, req.params.id);
  if (!board) return res.status(404).json({ error: 'Board not found.' });
  const list = await webhooks.find({ boardId: board._id }).sort({ _id: 1 }).toArray();
  res.json({ events: WEBHOOK_EVENTS, webhooks: list.map(toWebhook) });
});

// Events list sariyaa? (illana ['*'] = ellaam)
function cleanEvents(raw: unknown): string[] | null {
  if (raw === undefined) return ['*'];
  if (!Array.isArray(raw) || raw.length === 0) return null;
  if (raw.includes('*')) return ['*'];
  return raw.every((e) => (WEBHOOK_EVENTS as readonly unknown[]).includes(e)) ? [...new Set(raw as string[])] : null;
}

// ➕ Pudhu webhook: secret ore thadavai mattum badhil la
router.post('/api/boards/:id/webhooks', requireUser, async (req, res) => {
  const board = await findMyBoard(req, req.params.id);
  if (!board) return res.status(404).json({ error: 'Board not found.' });
  const problem = checkWebhookUrl(req.body?.url);
  if (problem) return res.status(400).json({ error: problem });
  const events = cleanEvents(req.body?.events);
  if (!events) return res.status(400).json({ error: 'Pick at least one valid event.' });
  if ((await webhooks.countDocuments({ boardId: board._id })) >= MAX_WEBHOOKS_PER_BOARD) {
    return res.status(400).json({ error: `A board can have up to ${MAX_WEBHOOKS_PER_BOARD} webhooks.` });
  }
  const doc: WebhookDoc = {
    userId: req.user!._id,
    boardId: board._id,
    url: req.body.url,
    secret: newWebhookSecret(),
    events,
    active: true,
    failures: 0,
    deliveries: [],
    createdAt: new Date(),
  };
  const result = await webhooks.insertOne(doc);
  invalidate(`webhooks:${board._id}`);
  res.status(201).json({ ...toWebhook({ _id: result.insertedId, ...doc }), secret: doc.secret });
});

// En webhook ah kandupidi (vera aal oda ah thoda mudiyaadhu)
async function findMyWebhook(req: express.Request) {
  const id = toObjectId(req.params.id);
  return id ? webhooks.findOne({ _id: id, userId: req.user!._id }) : null;
}

// ✏️ On / off, events maathu (auto-off aanadha thirumba on pannalaam)
router.patch('/api/webhooks/:id', requireUser, async (req, res) => {
  const hook = await findMyWebhook(req);
  if (!hook) return res.status(404).json({ error: 'Webhook not found.' });
  const changes: Partial<WebhookDoc> = {};
  if ('active' in (req.body || {})) {
    if (typeof req.body.active !== 'boolean') return res.status(400).json({ error: 'active must be true or false.' });
    changes.active = req.body.active;
    if (req.body.active) changes.failures = 0;
  }
  if ('events' in (req.body || {})) {
    const events = cleanEvents(req.body.events);
    if (!events) return res.status(400).json({ error: 'Pick at least one valid event.' });
    changes.events = events;
  }
  if (Object.keys(changes).length === 0) return res.status(400).json({ error: 'Nothing to update.' });
  const updated = await webhooks.findOneAndUpdate({ _id: hook._id }, { $set: changes }, { returnDocument: 'after' });
  invalidate(`webhooks:${hook.boardId}`);
  res.json(toWebhook(updated!));
});

router.delete('/api/webhooks/:id', requireUser, async (req, res) => {
  const hook = await findMyWebhook(req);
  if (!hook) return res.status(404).json({ error: 'Webhook not found.' });
  await webhooks.deleteOne({ _id: hook._id });
  invalidate(`webhooks:${hook.boardId}`);
  res.json({ ok: true });
});

// 🏓 Test "ping" anuppi result kaattu
router.post('/api/webhooks/:id/test', requireUser, webhookTestLimit, async (req, res) => {
  const hook = await findMyWebhook(req);
  if (!hook) return res.status(404).json({ error: 'Webhook not found.' });
  const delivery = await deliver(hook, 'ping', { board: { id: String(hook.boardId) }, message: 'Hello from Flowboard 👋' });
  res.json(delivery);
});

export default router;
