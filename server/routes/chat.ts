import express from 'express';
import { AVATAR_COLORS } from '../lib/constants.ts';
import { isText, toObjectId } from '../lib/helpers.ts';
import { requireUser } from '../lib/auth.ts';
import { boardPeople, findAccessibleBoard, ownsBoard } from '../lib/boards.ts';
import { chatMessages, users } from '../db.ts';
import { publish } from '../lib/realtime.ts';
import { notify } from '../lib/notify.ts';
import { findMentioned } from '../lib/mentions.ts';
import { chatLimit } from '../lib/rateLimit.ts';
import type { Request } from 'express';
import type { ChatMessage } from '../types.ts';

// 💬 Board team chat: board la irukkura ellaarum (viewers um) pesalaam. Live: SSE la 'chat' event
const router = express.Router();

const MAX_LENGTH = 1000;
const PAGE = 50;

// mine / canDelete: website la "Delete" button kaatta (user id website ku theriyaadhu)
function toChat(doc: ChatMessage, req: Request, owner: boolean) {
  const mine = doc.userId.equals(req.user!._id);
  return {
    id: String(doc._id),
    userId: String(doc.userId),
    name: doc.name,
    avatarColor: doc.avatarColor,
    text: doc.text,
    createdAt: doc.createdAt,
    mine,
    canDelete: mine || owner,
  };
}

// 📜 Kadaisi 50 messages (pazhasu mudhalla). ?before=<id> = innum pazhaya 50
router.get('/api/boards/:id/chat', requireUser, async (req, res) => {
  const board = await findAccessibleBoard(req, req.params.id);
  if (!board || !board.userId) return res.status(404).json({ error: 'Board not found.' }); // public demo board la chat illa (spam)
  const filter: Record<string, unknown> = { boardId: board._id };
  const before = toObjectId(req.query.before);
  if (before) filter._id = { $lt: before };
  const list = await chatMessages.find(filter).sort({ _id: -1 }).limit(PAGE + 1).toArray();
  res.json({ messages: list.slice(0, PAGE).reverse().map((m) => toChat(m, req, ownsBoard(req, board))), hasMore: list.length > PAGE });
});

// ✉️ Anuppu
router.post('/api/boards/:id/chat', requireUser, chatLimit, async (req, res) => {
  const board = await findAccessibleBoard(req, req.params.id);
  if (!board || !board.userId) return res.status(404).json({ error: 'Board not found.' }); // public demo board la chat illa (spam)
  const text = isText(req.body?.text) ? req.body.text.trim() : '';
  if (!text) return res.status(400).json({ error: 'Message is empty.' });
  if (text.length > MAX_LENGTH) return res.status(400).json({ error: `Messages can be up to ${MAX_LENGTH} characters.` });

  const me = req.user!;
  const doc = { boardId: board._id, userId: me._id, name: me.name, avatarColor: me.avatarColor ?? AVATAR_COLORS[0], text, createdAt: new Date() };
  const result = await chatMessages.insertOne(doc);

  // 🔔 @Bala nu irundhaa Bala ku notification
  const people = await users.find({ _id: { $in: boardPeople(board) } }, { projection: { name: 1 } }).toArray();
  for (const p of findMentioned(text, people)) {
    await notify(p._id, { type: 'mention', text: `${me.name} mentioned you in ${board.name} chat`, boardId: board._id }, me._id);
  }

  publish(board._id, 'chat', req); // ⚡
  res.status(201).json(toChat({ _id: result.insertedId, ...doc }, req, ownsBoard(req, board)));
});

// 🗑️ En message (illa board owner: ellaa message um)
router.delete('/api/chat/:id', requireUser, async (req, res) => {
  const id = toObjectId(req.params.id);
  const message = id && (await chatMessages.findOne({ _id: id }));
  const board = message && (await findAccessibleBoard(req, message.boardId));
  if (!message || !board) return res.status(404).json({ error: 'Message not found.' });
  if (!message.userId.equals(req.user!._id) && !ownsBoard(req, board)) {
    return res.status(403).json({ error: 'You can only delete your own messages.' });
  }
  await chatMessages.deleteOne({ _id: message._id });
  publish(board._id, 'chat', req);
  res.json({ ok: true });
});

export default router;
