import express from 'express';
import { requireUser } from '../lib/auth.ts';
import { csvCell, dayKey } from '../lib/helpers.ts';
import { findAccessibleBoard } from '../lib/boards.ts';
import { parseImport } from '../lib/importer.ts';
import { rateLimit } from '../lib/rateLimit.ts';
import { limitsFor } from '../lib/billing.ts';
import { boards, tasks, users } from '../db.ts';
import type { ObjectId } from 'mongodb';

// 📦 Ungal data: full backup (JSON), board CSV, import (Flowboard / Trello)
const router = express.Router();
const importLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: 'Too many imports. Please try again later.' });

// ⬇️ Ungal ellaa boards + tasks (unga data unga kitta: GDPR maari "data portability")
router.get('/api/account/export', requireUser, async (req, res) => {
  const mine = await boards.find({ userId: req.user!._id }).sort({ _id: 1 }).toArray();
  const allTasks = await tasks.find({ boardId: { $in: mine.map((b) => b._id) } }).sort({ order: 1, _id: 1 }).toArray();
  const payload = {
    format: 'flowboard-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    user: { name: req.user!.name, email: req.user!.email },
    boards: mine.map((b) => ({
      name: b.name,
      theme: b.theme ?? 'default',
      columns: b.columns,
      tasks: allTasks
        .filter((t) => t.boardId.equals(b._id))
        .map((t) => ({
          title: t.title,
          description: t.description ?? '',
          priority: t.priority,
          column: t.column,
          dueDate: t.dueDate ?? null,
          labels: t.labels ?? [],
          checklist: (t.checklist ?? []).map(({ text, done }) => ({ text, done })),
          repeat: t.repeat ?? null,
          comments: (t.comments ?? []).map(({ text, author, createdAt }) => ({ text, author, createdAt })),
          createdAt: t._id.getTimestamp(),
        })),
    })),
  };
  res.set('Content-Disposition', `attachment; filename="flowboard-export-${dayKey(new Date())}.json"`);
  res.json(payload);
});

// ⬇️ Oru board CSV ah (Excel / Google Sheets)
router.get('/api/boards/:id/export.csv', async (req, res) => {
  const board = await findAccessibleBoard(req, req.params.id);
  if (!board) return res.status(404).json({ error: 'Board not found.' });
  const list = await tasks.find({ boardId: board._id }).sort({ order: 1, _id: 1 }).toArray();
  const columnTitle = new Map(board.columns.map((c) => [c.id, c.title]));
  const people = await users.find({ _id: { $in: list.map((t) => t.assigneeId).filter((id): id is ObjectId => Boolean(id)) } }, { projection: { name: 1 } }).toArray();
  const nameOf = new Map(people.map((p) => [String(p._id), p.name]));

  const header = ['Title', 'Column', 'Priority', 'Due date', 'Labels', 'Assigned to', 'Checklist', 'Repeat', 'Description', 'Created'];
  const rows = list.map((t) => [
    t.title,
    columnTitle.get(t.column) ?? t.column,
    t.priority,
    t.dueDate ?? '',
    (t.labels ?? []).join(' '),
    nameOf.get(String(t.assigneeId)) ?? '',
    t.checklist?.length ? `${t.checklist.filter((i) => i.done).length}/${t.checklist.length}` : '',
    t.repeat ?? '',
    t.description ?? '',
    t._id.getTimestamp().toISOString(),
  ]);
  const safeName = board.name.replace(/[^\w-]+/g, '-').slice(0, 40) || 'board';
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${safeName}-${dayKey(new Date())}.csv"`);
  res.send('﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')); // 🛡️ csvCell = formula injection thaduppu
});

// ⬆️ Import: periya file (5 MB varaikkum) ku thani JSON parser (app.js la global parser intha path ah skip pannum)
router.post('/api/import', requireUser, importLimit, express.json({ limit: '5mb' }), async (req, res) => {
  const parsed = parseImport(req.body);
  if ('error' in parsed) return res.status(400).json({ error: parsed.error });
  if (!parsed.boards.length) return res.status(400).json({ error: 'No boards found in that file.' });

  const owned = await boards.countDocuments({ userId: req.user!._id });
  const maxBoards = limitsFor(req.user).boards; // 💎
  if (owned + parsed.boards.length > maxBoards) {
    return res.status(400).json({ error: `You can have up to ${maxBoards} boards. Delete some first.` });
  }

  const created = [];
  for (const b of parsed.boards) {
    const doc = { userId: req.user!._id, name: b.name, columns: b.columns, members: [], createdAt: new Date() };
    const { insertedId } = await boards.insertOne(doc);
    if (b.tasks.length) {
      const now = Date.now();
      await tasks.insertMany(
        b.tasks.map((t, i) => ({ ...t, comments: [], boardId: insertedId, userId: req.user!._id, createdBy: req.user!._id, order: now + i }))
      );
    }
    created.push({ id: String(insertedId), name: b.name, tasks: b.tasks.length });
  }
  console.log('📦 Import:', req.user!.email, parsed.format, created.length, 'boards');
  res.status(201).json({ format: parsed.format, boards: created });
});

export default router;
