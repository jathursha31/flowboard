import express from 'express';
import { escapeRegex, isText } from '../lib/helpers.ts';
import { boardOwner, ensureDefaultBoard } from '../lib/boards.ts';
import { boards, tasks } from '../db.ts';

// ⌨️ Ctrl + K: ellaa boards layum tasks thedu (paakka mudiyura boards la mattum)
const router = express.Router();

router.get('/api/search', async (req, res) => {
  const q = isText(req.query.q) ? req.query.q.trim().slice(0, 60) : '';

  await ensureDefaultBoard(boardOwner(req));
  const filter = req.user ? { $or: [{ userId: req.user._id }, { members: req.user._id }] } : { userId: null };
  const myBoards = await boards.find(filter, { projection: { name: 1, columns: 1 } }).sort({ _id: 1 }).toArray();
  const nameOf = new Map(myBoards.map((b) => [String(b._id), b.name]));

  const pattern = new RegExp(escapeRegex(q), 'i'); // 🛡️ escapeRegex: ReDoS thadukka
  const matchingBoards = myBoards.filter((b) => !q || pattern.test(b.name)).slice(0, 8);

  const found = q
    ? await tasks
        .find({ boardId: { $in: myBoards.map((b) => b._id) }, title: { $regex: escapeRegex(q), $options: 'i' } })
        .project({ title: 1, boardId: 1, column: 1 })
        .limit(20)
        .toArray()
    : [];

  res.json({
    boards: matchingBoards.map((b) => ({ id: String(b._id), name: b.name })),
    tasks: found.map((t) => ({ id: String(t._id), title: t.title, boardId: String(t.boardId), boardName: nameOf.get(String(t.boardId)), column: t.column })),
  });
});

export default router;
