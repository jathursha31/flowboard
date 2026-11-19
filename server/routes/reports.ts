import express from 'express';
import { requireUser } from '../lib/auth.ts';
import { dayKey, lastDays } from '../lib/helpers.ts';
import { boards, tasks } from '../db.ts';

// 📊 Reports: kadaisi 7 / 30 naal la enna nadandhudhu (mudicha tasks, pudhu tasks, boards, neram)
const router = express.Router();

router.get('/api/account/report', requireUser, async (req, res) => {
  const days = req.query.days === '30' ? 30 : 7;
  const uid = req.user!._id;
  const range = lastDays(days);
  const since = range[0];
  const today = dayKey(new Date());

  const myBoards = await boards.find({ $or: [{ userId: uid }, { members: uid }] }, { projection: { name: 1, columns: 1 } }).toArray();
  const doneCol = new Map(myBoards.map((b) => [String(b._id), b.columns.at(-1)?.id]));
  const all = await tasks
    .find({ boardId: { $in: myBoards.map((b) => b._id) } }, { projection: { title: 1, boardId: 1, column: 1, priority: 1, dueDate: 1, completedAt: 1, createdAt: 1, timeSpent: 1 } })
    .toArray();
  const isDone = (t: (typeof all)[number]) => t.column === doneCol.get(String(t.boardId));
  const createdAt = (t: (typeof all)[number]) => t.createdAt ?? t._id.getTimestamp();

  // 📅 Naal vaariyaa
  const perDay = new Map(range.map((d) => [dayKey(d), { completed: 0, created: 0 }]));
  for (const t of all) {
    if (t.completedAt && t.completedAt >= since) {
      const day = perDay.get(dayKey(t.completedAt));
      if (day) day.completed++;
    }
    if (createdAt(t) >= since) {
      const day = perDay.get(dayKey(createdAt(t)));
      if (day) day.created++;
    }
  }

  const open = all.filter((t) => !isDone(t));
  const boardName = new Map(myBoards.map((b) => [String(b._id), b.name]));
  const byBoard = myBoards
    .map((b) => {
      const mine = all.filter((t) => String(t.boardId) === String(b._id));
      return {
        id: String(b._id),
        name: b.name,
        open: mine.filter((t) => !isDone(t)).length,
        done: mine.filter(isDone).length,
        timeSpent: mine.reduce((sum, t) => sum + (t.timeSpent ?? 0), 0),
      };
    })
    .sort((a, b) => b.open + b.done - (a.open + a.done));

  res.json({
    days,
    from: dayKey(since),
    to: today,
    series: [...perDay].map(([day, v]) => ({ day, ...v })),
    totals: {
      completed: [...perDay.values()].reduce((s, d) => s + d.completed, 0),
      created: [...perDay.values()].reduce((s, d) => s + d.created, 0),
      open: open.length,
      overdue: open.filter((t) => t.dueDate && t.dueDate < today).length,
      timeSpent: all.reduce((s, t) => s + (t.timeSpent ?? 0), 0),
    },
    byPriority: Object.fromEntries(['high', 'medium', 'low'].map((p) => [p, open.filter((t) => (t.priority ?? 'medium') === p).length])),
    byBoard,
    topTime: all
      .filter((t) => (t.timeSpent ?? 0) > 0)
      .sort((a, b) => (b.timeSpent ?? 0) - (a.timeSpent ?? 0))
      .slice(0, 5)
      .map((t) => ({ id: String(t._id), title: t.title, board: boardName.get(String(t.boardId)) ?? '', seconds: t.timeSpent ?? 0 })),
  });
});

export default router;
