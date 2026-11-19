import express from 'express';
import { AVATAR_COLORS } from '../lib/constants.ts';
import { dayKey, getCookie, isText, lastDays, must } from '../lib/helpers.ts';
import { userAuthLimit } from '../lib/rateLimit.ts';
import { checkPassword, hashPassword, publicUser, requireUser } from '../lib/auth.ts';
import { apiKeys, boards, chatMessages, messages, pushSubscriptions, notifications, reviews, tasks, userSessions, users, webhooks } from '../db.ts';
import { deleteFilesWhere } from '../lib/attachments.ts';
import { invalidate } from '../lib/cache.ts';
import { billingEnabled, cancelSubscription, planOf } from '../lib/billing.ts';

// 👤 Account: profile, password, messages, stats, delete
const router = express.Router();

// 🆕 👤 ACCOUNT: peru / avatar colour maathu
router.patch('/api/account', requireUser, async (req, res) => {
  const body = req.body || {};
  const changes: Record<string, any> = {};
  if ('name' in body) {
    if (!isText(body.name) || body.name.trim().length < 2) return res.status(400).json({ error: 'Please enter your name.' });
    changes.name = body.name.trim().slice(0, 60);
  }
  if ('avatarColor' in body) {
    if (!AVATAR_COLORS.includes(body.avatarColor)) return res.status(400).json({ error: 'Invalid colour.' });
    changes.avatarColor = body.avatarColor;
  }
  if (Object.keys(changes).length === 0) return res.status(400).json({ error: 'Nothing to update.' });

  const updated = must(await users.findOneAndUpdate({ _id: req.user!._id }, { $set: changes }, { returnDocument: 'after' }));
  res.json({ user: publicUser(updated) });
});

// 🆕 🔑 Password maathu (pazhaya password venum). Mattha devices la logout aagum
router.post('/api/account/password', requireUser, userAuthLimit, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const settingFirst = !req.user!.passwordHash; // 🔵 Google account: mudhal thadavai password set pannuraanga
  if (!isText(newPassword) || (!settingFirst && !isText(currentPassword))) return res.status(400).json({ error: 'Fill in both passwords.' });
  if (!settingFirst && !(await checkPassword(currentPassword, req.user!.passwordHash))) {
    return res.status(401).json({ error: 'Your current password is wrong.' });
  }
  if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  if (newPassword === currentPassword) return res.status(400).json({ error: 'Choose a different password.' });

  await users.updateOne({ _id: req.user!._id }, { $set: { passwordHash: await hashPassword(newPassword) } });
  // 🚪 Mattha ellaa devices (tickets) la um logout. Ippo use panra ticket mattum irukkattum
  await userSessions.deleteMany({ userId: req.user!._id, token: { $ne: getCookie(req, 'user_token') } });
  console.log('🔑 Password changed:', req.user!.email);
  res.json({ ok: true });
});

// 🆕 ✉️ Naan login aagi anuppuna messages + admin reply
router.get('/api/account/messages', requireUser, async (req, res) => {
  const list = await messages.find({ userId: req.user!._id }).sort({ _id: -1 }).limit(20).toArray();
  res.json(
    list.map((m) => ({
      id: m._id,
      message: m.message,
      createdAt: m.createdAt,
      reply: m.reply ? { text: m.reply.text, at: m.reply.at } : null,
    }))
  );
});

// 🆕 📊 My stats: indha vaaram mudicha tasks, streak, overdue...
router.get('/api/account/stats', requireUser, async (req, res) => {
  const uid = req.user!._id;
  const myBoards = await boards.find({ $or: [{ userId: uid }, { members: uid }] }).toArray();
  const doneByBoard = new Map(myBoards.map((b) => [String(b._id), b.columns[b.columns.length - 1]?.id]));
  const all = await tasks
    .find({ boardId: { $in: myBoards.map((b) => b._id) } }, { projection: { column: 1, boardId: 1, dueDate: 1, completedAt: 1 } })
    .toArray();

  const today = dayKey(new Date());
  const isDone = (t: { column: string; boardId: unknown }) => t.column === doneByBoard.get(String(t.boardId));
  const done = all.filter(isDone).length;
  const overdue = all.filter((t) => !isDone(t) && t.dueDate && t.dueDate < today).length;

  // 📅 Kadaisi 7 naal: naal vaariyaa ethanai tasks mudichcheenga
  const completedDays = new Map(); // "2026-10-22" → count
  for (const t of all) {
    if (!t.completedAt) continue;
    const key = dayKey(t.completedAt);
    completedDays.set(key, (completedDays.get(key) ?? 0) + 1);
  }
  const week = lastDays(7).map((d) => ({ day: dayKey(d), count: completedDays.get(dayKey(d)) ?? 0 }));

  // 🔥 Streak: innaikku (illa netru) varaikkum thodarndhu ethanai naal task mudichcheenga
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!completedDays.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1); // innaikku innum illana netru la irunthu
  while (completedDays.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  res.json({
    totalTasks: all.length,
    done,
    open: all.length - done,
    overdue,
    thisWeek: week.reduce((sum, d) => sum + d.count, 0),
    streak,
    week,
    ownedBoards: myBoards.filter((b) => b.userId?.equals(uid)).length,
    sharedBoards: myBoards.filter((b) => !b.userId?.equals(uid)).length,
    memberSince: req.user!.createdAt,
  });
});

// 🆕 🗑️ Account delete (password confirm venum). Ungal boards + tasks ellaam azhiyum
router.delete('/api/account', requireUser, userAuthLimit, async (req, res) => {
  const { password, confirmEmail } = req.body || {};
  if (req.user!.passwordHash) {
    if (!isText(password) || !(await checkPassword(password, req.user!.passwordHash))) {
      return res.status(401).json({ error: 'Wrong password.' });
    }
  } else if (!isText(confirmEmail) || confirmEmail.trim().toLowerCase() !== req.user!.email) {
    // 🔵 Password illaadha Google account: email type panni confirm
    return res.status(401).json({ error: 'Type your email address to confirm.' });
  }
  const uid = req.user!._id;
  // 💳 Pro subscription irundhaa mudhalla Stripe la cancel (fail aanaa account delete pannaadhe: kaasu pogum)
  if (req.user!.stripeSubscriptionId && planOf(req.user) === 'pro' && billingEnabled()) {
    try {
      await cancelSubscription(req.user!.stripeSubscriptionId);
    } catch (err) {
      console.log('⚠️ Subscription cancel fail:', (err as Error).message);
      return res.status(502).json({ error: "We couldn't cancel your subscription. Cancel it under Plan → Manage billing, then try again." });
    }
  }
  const owned = await boards.find({ userId: uid }, { projection: { _id: 1 } }).toArray();
  await tasks.deleteMany({ boardId: { $in: owned.map((b) => b._id) } });
  await deleteFilesWhere({ 'metadata.boardId': { $in: owned.map((b) => b._id) } }); // 📎 avanga boards files
  await tasks.deleteMany({ userId: uid });
  await boards.deleteMany({ userId: uid });
  await boards.updateMany({ members: uid }, { $pull: { members: uid, viewers: uid } }); // 👥 friends boards la irunthu um vilagu
  await reviews.deleteMany({ userId: uid }); // 🆕 ⭐ avanga review um poganum
  invalidate('public:reviews');
  await notifications.deleteMany({ userId: uid }); // 🔔 avanga notifications
  await tasks.updateMany({ assigneeId: uid }, { $set: { assigneeId: null } }); // 👤 friends boards la assign aana tasks
  await messages.updateMany({ userId: uid }, { $set: { userId: null } }); // 🆕 ✉️ message irukkum, account link mattum pogum
  await userSessions.deleteMany({ userId: uid });
  await apiKeys.deleteMany({ userId: uid }); // 🔑
  await pushSubscriptions.deleteMany({ userId: uid }); // 🔔
  await webhooks.deleteMany({ userId: uid }); // 🪝
  await chatMessages.deleteMany({ $or: [{ userId: uid }, { boardId: { $in: owned.map((b) => b._id) } }] }); // 💬 avanga messages + avanga boards chat
  invalidate('webhooks:');
  await users.deleteOne({ _id: uid });
  res.clearCookie('user_token');
  console.log('🗑️ Account deleted:', req.user!.email);
  res.json({ ok: true });
});

export default router;
