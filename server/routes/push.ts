import express from 'express';
import { requireUser } from '../lib/auth.ts';
import { isText } from '../lib/helpers.ts';
import { pushSubscriptions } from '../db.ts';
import { isPushEndpoint, sendPush, vapidKeys } from '../lib/push.ts';
import { webhookTestLimit } from '../lib/rateLimit.ts';

// 🔔 Push notifications: device ah register / remove, test alert
const router = express.Router();
const MAX_DEVICES = 10;

// 🔑 Browser ku namma public key (subscribe panna venum)
router.get('/api/push/key', async (req, res) => {
  res.json({ publicKey: (await vapidKeys()).publicKey });
});

router.get('/api/push/status', requireUser, async (req, res) => {
  res.json({ devices: await pushSubscriptions.countDocuments({ userId: req.user!._id }) });
});

// 📱 Indha device ku alerts venum
router.post('/api/push/subscribe', requireUser, async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!isPushEndpoint(endpoint) || !isText(keys?.p256dh) || !isText(keys?.auth) || keys.p256dh.length > 200 || keys.auth.length > 100) {
    return res.status(400).json({ error: 'Invalid push subscription.' });
  }
  const uid = req.user!._id;
  // Ore device thirumba subscribe pannaa update (vera user login aanaalum avangalukku maarum)
  await pushSubscriptions.updateOne(
    { endpoint },
    { $set: { userId: uid, keys: { p256dh: keys.p256dh, auth: keys.auth } }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );
  // Romba devices na pazhasu ah thookku
  const extra = await pushSubscriptions.find({ userId: uid }).sort({ _id: -1 }).skip(MAX_DEVICES).toArray();
  if (extra.length) await pushSubscriptions.deleteMany({ _id: { $in: extra.map((s) => s._id) } });
  res.status(201).json({ ok: true });
});

router.post('/api/push/unsubscribe', requireUser, async (req, res) => {
  const { endpoint } = req.body || {};
  if (!isText(endpoint)) return res.status(400).json({ error: 'Invalid push subscription.' });
  await pushSubscriptions.deleteOne({ endpoint, userId: req.user!._id });
  res.json({ ok: true });
});

// 🏓 "Test alert anuppu"
router.post('/api/push/test', requireUser, webhookTestLimit, async (req, res) => {
  const sent = await sendPush(req.user!._id, { title: 'Flowboard 🔔', body: 'Notifications are working!', url: '/app' });
  res.json({ sent });
});

export default router;
