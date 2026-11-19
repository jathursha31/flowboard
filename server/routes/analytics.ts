import express from 'express';
import { dayKey } from '../lib/helpers.ts';
import { analytics } from '../db.ts';
import { TRACK_EVENTS, cleanPath, cleanReferrer, deviceOf, shouldSkip, visitorId } from '../lib/analytics.ts';
import { trackLimit } from '../lib/rateLimit.ts';

// 📊 Website "intha page paathaanga" / "intha button click pannaanga" nu sollum (login venaam)
const router = express.Router();

router.post('/api/track', trackLimit, async (req, res) => {
  const body = req.body || {};
  const path = cleanPath(body.path);
  const isEvent = body.type === 'event';
  if (!path || (body.type !== 'pageview' && !isEvent)) return res.status(400).json({ error: 'Invalid event.' });
  if (isEvent && !(TRACK_EVENTS as readonly unknown[]).includes(body.name)) return res.status(400).json({ error: 'Unknown event.' });
  if (path.startsWith('/admin') || path.startsWith('/login') || shouldSkip(req)) return res.status(204).end(); // 🙅 count pannaadhe

  const now = new Date();
  const day = dayKey(now);
  await analytics.insertOne({
    type: isEvent ? 'event' : 'pageview',
    name: isEvent ? body.name : null,
    path,
    ref: isEvent ? null : cleanReferrer(body.referrer, req.get('host')),
    device: deviceOf(req.get('user-agent') ?? ''),
    visitor: visitorId(req, day),
    day,
    createdAt: now,
  });
  res.status(204).end();
});

export default router;
