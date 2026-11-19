import express from 'express';
import { AVATAR_COLORS } from '../lib/constants.ts';
import { isText } from '../lib/helpers.ts';
import { contactLimit, reviewLimit } from '../lib/rateLimit.ts';
import { requireUser } from '../lib/auth.ts';
import { messages, reviews, settings, updates, users } from '../db.ts';
import { cached, invalidate } from '../lib/cache.ts';

// 🌍 Public API: contact form, banner, reviews, updates
const router = express.Router();

// 📨 Contact message save (🚦 contactLimit: 10 nimishaththukku 5 messages)
router.post('/api/contact', contactLimit, async (req, res) => {
  const { name, email, team, message } = req.body || {};

  if (!isText(name) || name.trim().length < 2) {
    return res.status(400).json({ error: 'Peru venum!' });
  }
  if (!isText(email) || !email.includes('@')) {
    return res.status(400).json({ error: 'Seriyaana email venum!' });
  }
  if (!isText(message) || message.trim().length < 10) {
    return res.status(400).json({ error: 'Message 10 letters aavadhu venum!' });
  }

  await messages.insertOne({
    name: name.trim(),
    email: email.trim(),
    team: isText(team) ? team : '',
    message: message.trim(),
    userId: req.user ? req.user._id : null, // 🆕 ✉️ login aagirundhaa reply ah Account page la kaattalaam
    createdAt: new Date(),
  });

  console.log('📨 Pudhu message save aagiduchu:', name);
  res.json({ ok: true });
});

// 🆕 📢 PUBLIC: site banner (off na banner: null)
// ⚡ cached: ellaa pages layum ovvoru visit kkum kekkum, adhanaala 30 sec nyaabagam (admin maathinaa udane azhiyum)
router.get('/api/banner', async (req, res) => {
  const banner = await cached('public:banner', 30_000, async () => {
    const b = await settings.findOne({ _id: 'banner' });
    return b?.active && b.text ? { text: b.text, tone: b.tone, version: b.updatedAt?.getTime() ?? 0 } : null;
  });
  res.json({ banner });
});

// 🆕 ⭐ PUBLIC: approve aana reviews (landing page ku)
router.get('/api/reviews', async (req, res) => {
  res.json(await cached('public:reviews', 30_000, loadReviews));
});

async function loadReviews() {
  const list = await reviews.find({ approved: true }).sort({ _id: -1 }).limit(12).toArray();
  const authors = await users.find({ _id: { $in: list.map((r) => r.userId) } }, { projection: { avatarColor: 1 } }).toArray();
  const colorOf = new Map(authors.map((u) => [String(u._id), u.avatarColor]));
  return list.map((r) => ({
    id: r._id.toString(),
    name: r.name,
    role: r.role,
    rating: r.rating,
    text: r.text,
    avatarColor: colorOf.get(String(r.userId)) ?? AVATAR_COLORS[0],
  }));
}

// 🆕 ⭐ En review (status paakka / form la pazhaya review kaatta)
router.get('/api/reviews/mine', requireUser, async (req, res) => {
  const mine = await reviews.findOne({ userId: req.user!._id });
  res.json({ review: mine ? { rating: mine.rating, text: mine.text, role: mine.role, approved: mine.approved } : null });
});

// 🆕 ⭐ Review ezhudhu / maathu (oru user ku oru review, maathinaa thirumba approve venum)
router.post('/api/reviews', requireUser, reviewLimit, async (req, res) => {
  const { rating, text, role } = req.body || {};
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'Pick a rating from 1 to 5 stars.' });
  if (!isText(text) || text.trim().length < 10) return res.status(400).json({ error: 'Write at least 10 characters.' });
  if (role !== undefined && !isText(role)) return res.status(400).json({ error: 'Invalid role.' });

  await reviews.updateOne(
    { userId: req.user!._id },
    {
      $set: {
        name: req.user!.name,
        rating,
        text: text.trim().slice(0, 400),
        role: isText(role) ? role.trim().slice(0, 60) : '',
        approved: false, // 👮 admin paakkura varaikkum website la varaadhu (spam / ketta vaarthai thadukka)
        updatedAt: new Date(),
      },
      $setOnInsert: { userId: req.user!._id, createdAt: new Date() },
    },
    { upsert: true } // illana create, irundhaa update
  );
  console.log('⭐ Review from', req.user!.email, rating, 'stars');
  invalidate('public:reviews'); // maathina review thirumba approve aagura varaikkum maraiyanum
  res.json({ ok: true });
});

// 🆕 📰 PUBLIC: kadaisi 5 updates (landing "What's new")
router.get('/api/updates', async (req, res) => {
  const list = await cached('public:updates', 30_000, async () => {
    const docs = await updates.find().sort({ _id: -1 }).limit(5).toArray();
    return docs.map((u) => ({ id: u._id.toString(), title: u.title, body: u.body, createdAt: u.createdAt }));
  });
  res.json(list);
});

export default router;
