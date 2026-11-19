import express from 'express';
import { requireUser } from '../lib/auth.ts';
import { toObjectId } from '../lib/helpers.ts';
import { notifications } from '../db.ts';

// 🔔 Bell icon: en notifications + padichaachu nu mark
const router = express.Router();

router.get('/api/notifications', requireUser, async (req, res) => {
  const list = await notifications.find({ userId: req.user!._id }).sort({ createdAt: -1 }).limit(30).toArray();
  const unread = await notifications.countDocuments({ userId: req.user!._id, read: false });
  res.json({
    unread,
    items: list.map((n) => ({
      id: n._id.toString(),
      type: n.type,
      text: n.text,
      boardId: n.boardId ? String(n.boardId) : null,
      taskId: n.taskId ? String(n.taskId) : null,
      read: n.read,
      createdAt: n.createdAt,
    })),
  });
});

router.post('/api/notifications/read-all', requireUser, async (req, res) => {
  await notifications.updateMany({ userId: req.user!._id, read: false }, { $set: { read: true } });
  res.json({ ok: true });
});

router.post('/api/notifications/:id/read', requireUser, async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (_id) await notifications.updateOne({ _id, userId: req.user!._id }, { $set: { read: true } }); // 🛡️ en notification mattum
  res.json({ ok: true });
});

export default router;
