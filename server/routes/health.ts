import express from 'express';
import { db } from '../db.ts';
import { requireAdmin } from '../lib/auth.ts';
import { metricsSnapshot } from '../lib/observability.ts';
import { sendDueReminders } from '../lib/notify.ts';

// 🩺 Health: hosting (Render, Docker) "server uyiroda irukkaa?" nu adikkadi kekkum
const router = express.Router();

async function dbPing() {
  const start = performance.now();
  try {
    await db.command({ ping: 1 });
    return { ok: true, ms: Math.round(performance.now() - start) };
  } catch {
    return { ok: false, ms: null };
  }
}

// PUBLIC: secret onnum illa, "ok" illa "down" mattum (DB down na 503: hosting restart pannum / alert anuppum)
router.get('/api/health', async (req, res) => {
  const database = await dbPing();
  res.status(database.ok ? 200 : 503).json({
    status: database.ok ? 'ok' : 'degraded',
    uptimeSeconds: metricsSnapshot().uptimeSeconds,
    database,
    version: process.env.APP_VERSION || 'dev',
  });
});

// 👮 Admin mattum: full numbers (admin page "Server health" section um ithai use pannum)
router.get('/api/admin/metrics', requireAdmin, async (req, res) => {
  res.json({ ...metricsSnapshot(), database: await dbPing() });
});

// ⏰ Vercel Cron (naal ku oru thadavai): due date reminders. Normal server la index.ts mani ku oru thadavai pannum
// Vercel "Authorization: Bearer <CRON_SECRET>" anuppum: secret illaama yaarum trigger panna mudiyaadhu
router.get('/api/cron/reminders', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.get('authorization') !== `Bearer ${secret}`) return res.status(401).json({ error: 'Not allowed.' });
  res.json({ sent: await sendDueReminders() });
});

export { dbPing };
export default router;
