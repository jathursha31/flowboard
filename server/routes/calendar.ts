import express from 'express';
import { requireUser } from '../lib/auth.ts';
import { users } from '../db.ts';
import { buildCalendar, newCalendarToken } from '../lib/calendar.ts';
import { calendarLimit } from '../lib/rateLimit.ts';
import type { Request } from 'express';

// 📅 Calendar feed: en ragasiya link + .ics file
const router = express.Router();

const appUrl = () => (process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, '');
// Calendar app kitta kudukkura link (server address vechu: proxy pinnaadi na TRUST_PROXY venum)
const feedUrl = (req: Request, token: string) => `${process.env.APP_URL ? appUrl() : `${req.protocol}://${req.get('host')}`}/api/calendar/${token}.ics`;

router.get('/api/account/calendar', requireUser, async (req, res) => {
  let token = req.user!.calendarToken;
  if (!token) {
    token = newCalendarToken();
    await users.updateOne({ _id: req.user!._id }, { $set: { calendarToken: token } });
  }
  res.json({ url: feedUrl(req, token) });
});

// 🔄 Pudhu link (pazhaya link vela seiyaadhu)
router.post('/api/account/calendar/reset', requireUser, async (req, res) => {
  const token = newCalendarToken();
  await users.updateOne({ _id: req.user!._id }, { $set: { calendarToken: token } });
  res.json({ url: feedUrl(req, token) });
});

// 📥 Calendar apps idhai adikkadi download pannum (login cookie illa: token thaan password)
router.get('/api/calendar/:token.ics', calendarLimit, async (req, res) => {
  const token = String(req.params.token);
  const user = /^[\w-]{20,64}$/.test(token) ? await users.findOne({ calendarToken: token }, { projection: { _id: 1, disabled: 1 } }) : null;
  if (!user || user.disabled) return res.status(404).type('text/plain').send('Calendar not found.');
  res.set({ 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=300', 'Content-Disposition': 'inline; filename="flowboard.ics"' });
  res.send(await buildCalendar(user._id, appUrl()));
});

export default router;
