import express from 'express';
import { BOARD_THEMES, COLUMN_ID_PATTERN, DEFAULT_COLUMNS, EMAIL_PATTERN, LABEL_COLORS, LABEL_ID_PATTERN, MAX_COLUMNS, MAX_LABELS } from '../lib/constants.ts';
import { limitsFor, planOf } from '../lib/billing.ts';
import { dayKey, isText, toObjectId } from '../lib/helpers.ts';
import { TEMPLATES, templateSummary } from '../lib/templates.ts';
import { requireUser } from '../lib/auth.ts';
import { accessOf, boardOwner, ensureDefaultBoard, findAccessibleBoard, findMyBoard, membersPayload, ownsBoard, toBoard } from '../lib/boards.ts';
import { boards, tasks, users } from '../db.ts';
import { publish } from '../lib/realtime.ts';
import { notify } from '../lib/notify.ts';
import { toActivity } from '../lib/activity.ts';
import { activity, chatMessages, webhooks } from '../db.ts';
import { invalidate } from '../lib/cache.ts';
import { deleteFilesWhere } from '../lib/attachments.ts';
import type { ObjectId } from 'mongodb';

// 📋 Boards + members (share)
const router = express.Router();

// 📋 BOARDS: sondha boards + 🆕 friends share panna boards
router.get('/api/boards', async (req, res) => {
  const owner = boardOwner(req);
  await ensureDefaultBoard(owner);
  const filter = req.user ? { $or: [{ userId: req.user._id }, { members: req.user._id }] } : { userId: null };
  const all = await boards.find(filter).sort({ _id: 1 }).toArray();

  // 👥 Share panna boards ku owner peru
  const otherOwnerIds = all.filter((b) => !ownsBoard(req, b)).map((b) => b.userId).filter((id): id is ObjectId => Boolean(id));
  const owners = await users.find({ _id: { $in: otherOwnerIds } }, { projection: { name: 1 } }).toArray();
  const ownerName = new Map(owners.map((u) => [String(u._id), u.name]));

  // Sondha boards mudhalla, apram share panna boards
  const mine = all.filter((b) => ownsBoard(req, b)).map((b) => toBoard(b));
  const sharedWithMe = all
    .filter((b) => !ownsBoard(req, b))
    .map((b) => toBoard(b, 'member', ownerName.get(String(b.userId)) ?? 'Someone', accessOf(req, b)));
  res.json([...mine, ...sharedWithMe]);
});

// 🗂️ Ready-made board templates (login venaam: list mattum)
router.get('/api/templates', (req, res) => {
  res.json(TEMPLATES.map(templateSummary));
});

// ➕ Pudhu board (login venum). template = 'wedding' maari kudutha, columns + labels + tasks ready ah varum
router.post('/api/boards', requireUser, async (req, res) => {
  const { name, template: templateId } = req.body || {};
  const template = templateId === undefined ? null : TEMPLATES.find((t) => t.id === templateId);
  if (template === undefined) return res.status(400).json({ error: 'Unknown template.' });
  const boardName = isText(name) && name.trim() ? name : template?.name;
  if (!boardName) return res.status(400).json({ error: 'Board name is required.' });
  const maxBoards = limitsFor(req.user).boards; // 💎 Pro na adhigam
  if ((await boards.countDocuments({ userId: req.user!._id })) >= maxBoards) {
    return res.status(400).json({ error: `You can have up to ${maxBoards} boards.${planOf(req.user) === 'free' ? ' Upgrade to Pro for more.' : ''}` });
  }
  const doc = {
    userId: req.user!._id,
    name: boardName.trim().slice(0, 40),
    columns: (template?.columns ?? DEFAULT_COLUMNS).map((c) => ({ ...c })),
    ...(template && { labels: template.labels.map((l) => ({ ...l })) }),
    members: [],
    createdAt: new Date(),
  };
  const result = await boards.insertOne(doc);
  if (template) {
    const now = Date.now();
    await tasks.insertMany(
      template.tasks.map(([title, column, priority, days, labels], i) => ({
        boardId: result.insertedId,
        userId: req.user!._id,
        createdBy: req.user!._id,
        title,
        column,
        priority,
        labels,
        dueDate: days === null ? null : dayKey(now + days * 86400000),
        description: '',
        checklist: [],
        comments: [],
        order: i,
        createdAt: new Date(),
      }))
    );
  }
  console.log('📋 Pudhu board:', doc.name);
  res.status(201).json(toBoard({ _id: result.insertedId, ...doc }));
});

// ✏️ Board peru / columns maathu (owner mattum)
router.patch('/api/boards/:id', requireUser, async (req, res) => {
  const board = await findMyBoard(req, req.params.id);
  if (!board) return res.status(404).json({ error: 'Board not found.' });

  const body = req.body || {};
  const changes: Record<string, any> = {};

  if ('name' in body) {
    if (!isText(body.name) || !body.name.trim()) return res.status(400).json({ error: 'Board name is required.' });
    changes.name = body.name.trim().slice(0, 40);
  }

  if ('columns' in body) {
    const cols = body.columns;
    const ok =
      Array.isArray(cols) &&
      cols.length >= 1 &&
      cols.length <= MAX_COLUMNS &&
      cols.every((c) => c && isText(c.id) && COLUMN_ID_PATTERN.test(c.id) && isText(c.title) && c.title.trim()) &&
      new Set(cols.map((c) => c.id)).size === cols.length; // 🚫 ore id rendu thadavai koodaadhu
    if (!ok) return res.status(400).json({ error: `Columns: 1 to ${MAX_COLUMNS}, each with a name.` });
    changes.columns = cols.map((c) => ({ id: c.id, title: c.title.trim().slice(0, 30) }));
  }

  // 🆕 🎨 Theme: list la irukkuradhu mattum
  if ('theme' in body) {
    if (!BOARD_THEMES.includes(body.theme)) return res.status(400).json({ error: 'Unknown theme.' });
    changes.theme = body.theme;
  }

  // 🆕 🏷️ Labels: [{ id, name, color }] (max 12)
  if ('labels' in body) {
    const list = body.labels;
    const ok =
      Array.isArray(list) &&
      list.length <= MAX_LABELS &&
      list.every((l) => l && isText(l.id) && LABEL_ID_PATTERN.test(l.id) && isText(l.name) && l.name.trim() && LABEL_COLORS.includes(l.color)) &&
      new Set(list.map((l) => l.id)).size === list.length;
    if (!ok) return res.status(400).json({ error: `Labels: up to ${MAX_LABELS}, each with a name and colour.` });
    changes.labels = list.map((l) => ({ id: l.id, name: l.name.trim().slice(0, 20), color: l.color }));
  }

  if (Object.keys(changes).length === 0) return res.status(400).json({ error: 'Nothing to update.' });

  await boards.updateOne({ _id: board._id }, { $set: changes });

  // 🧹 Azhicha label ah tasks la irunthu um eduthudu
  if (changes.labels) {
    const keep = changes.labels.map((l: { id: string }) => l.id);
    await tasks.updateMany({ boardId: board._id }, { $pull: { labels: { $nin: keep } } });
  }

  // 🧹 Azhicha column la irundha tasks ah mudhal column ku maathu (tasks kaanaama poga koodaadhu!)
  if (changes.columns) {
    const keep = changes.columns.map((c: { id: string }) => c.id);
    await tasks.updateMany({ boardId: board._id, column: { $nin: keep } }, { $set: { column: keep[0] } });
  }

  publish(board._id, 'board', req); // ⚡ friends screen la columns / theme maarum
  res.json(toBoard({ ...board, ...changes }));
});

// 🗑️ Board azhi (owner mattum, kadaisi board ah azhikka mudiyaadhu)
router.delete('/api/boards/:id', requireUser, async (req, res) => {
  const board = await findMyBoard(req, req.params.id);
  if (!board) return res.status(404).json({ error: 'Board not found.' });
  if ((await boards.countDocuments({ userId: req.user!._id })) <= 1) {
    return res.status(400).json({ error: "You can't delete your only board." });
  }
  await tasks.deleteMany({ boardId: board._id });
  await deleteFilesWhere({ 'metadata.boardId': board._id }); // 📎
  await boards.deleteOne({ _id: board._id });
  await webhooks.deleteMany({ boardId: board._id }); // 🪝
  await chatMessages.deleteMany({ boardId: board._id }); // 💬
  invalidate(`webhooks:${board._id}`);
  console.log('🗑️ Board azhichiduchu:', board.name);
  res.json({ ok: true });
});

// 🆕 🕓 Board history (?taskId= kudutha andha task oda history mattum)
router.get('/api/boards/:id/activity', async (req, res) => {
  const board = await findAccessibleBoard(req, req.params.id);
  if (!board) return res.status(404).json({ error: 'Board not found.' });
  const filter: Record<string, unknown> = { boardId: board._id };
  const taskId = toObjectId(req.query.taskId);
  if (taskId) filter.taskId = taskId;
  const list = await activity.find(filter).sort({ createdAt: -1 }).limit(50).toArray();
  res.json(list.map(toActivity));
});

router.get('/api/boards/:id/members', requireUser, async (req, res) => {
  const board = await findAccessibleBoard(req, req.params.id);
  if (!board) return res.status(404).json({ error: 'Board not found.' });
  res.json(await membersPayload(board));
});

// 🆕 👥➕ Friend ah invite (owner mattum, avangalukku Flowboard account irukkanum)
router.post('/api/boards/:id/members', requireUser, async (req, res) => {
  const board = await findMyBoard(req, req.params.id);
  if (!board) return res.status(404).json({ error: 'Board not found.' });

  const { email, role = 'editor' } = req.body || {};
  if (!['editor', 'viewer'].includes(role)) return res.status(400).json({ error: 'Role must be editor or viewer.' });
  if (!isText(email) || !EMAIL_PATTERN.test(email.trim())) return res.status(400).json({ error: 'Please enter a valid email.' });

  const friend = await users.findOne({ email: email.trim().toLowerCase() });
  if (!friend || friend.disabled) {
    return res.status(404).json({ error: 'No Flowboard account with that email. Ask them to sign up first.' });
  }
  if (friend._id.equals(req.user!._id)) return res.status(400).json({ error: "That's you! You already own this board." });
  const maxMembers = limitsFor(req.user).members; // 💎
  if ((board.members ?? []).length >= maxMembers) return res.status(400).json({ error: `Up to ${maxMembers} people per board.${planOf(req.user) === 'free' ? ' Upgrade to Pro for more.' : ''}` });

  await boards.updateOne(
    { _id: board._id },
    role === 'viewer'
      ? { $addToSet: { members: friend._id, viewers: friend._id } } // $addToSet = rendu thadavai serkkaadhu
      : { $addToSet: { members: friend._id }, $pull: { viewers: friend._id } }
  );
  console.log('👥', friend.email, 'joined board', board.name);
  await notify(friend._id, { type: 'shared', text: `${req.user!.name} shared the board "${board.name}" with you`, boardId: board._id }, req.user!._id);
  publish(board._id, 'board', req);
  res.json(await membersPayload((await boards.findOne({ _id: board._id }))!));
});

// 🆕 👀 Member oda role maathu: editor ↔ viewer (owner mattum)
router.patch('/api/boards/:id/members/:userId', requireUser, async (req, res) => {
  const board = await findMyBoard(req, req.params.id);
  if (!board) return res.status(404).json({ error: 'Board not found.' });
  const target = toObjectId(req.params.userId);
  if (!target || !(board.members ?? []).some((m) => m.equals(target))) return res.status(404).json({ error: 'That person is not on this board.' });
  const { role } = req.body || {};
  if (!['editor', 'viewer'].includes(role)) return res.status(400).json({ error: 'Role must be editor or viewer.' });

  await boards.updateOne({ _id: board._id }, role === 'viewer' ? { $addToSet: { viewers: target } } : { $pull: { viewers: target } });
  publish(board._id, 'board', req); // ⚡ avanga screen la udane "View only" aagum
  res.json(await membersPayload((await boards.findOne({ _id: board._id }))!));
});

// 🆕 👥➖ Member ah remove (owner yaaraiyum), illa member thaane "Leave" (userId = "me")
router.delete('/api/boards/:id/members/:userId', requireUser, async (req, res) => {
  const board = await findAccessibleBoard(req, req.params.id);
  if (!board) return res.status(404).json({ error: 'Board not found.' });

  const target = req.params.userId === 'me' ? req.user!._id : toObjectId(req.params.userId);
  if (!target) return res.status(400).json({ error: 'Invalid member.' });

  const leavingMyself = target.equals(req.user!._id);
  if (!ownsBoard(req, board) && !leavingMyself) return res.status(403).json({ error: 'Only the owner can remove people.' });
  if (ownsBoard(req, board) && leavingMyself) return res.status(400).json({ error: "The owner can't leave their own board." });

  await boards.updateOne({ _id: board._id }, { $pull: { members: target, viewers: target } });
  await tasks.updateMany({ boardId: board._id, assigneeId: target }, { $set: { assigneeId: null } }); // 👤 avanga assign ah eduthudu
  publish(board._id, 'board', req);
  res.json(await membersPayload((await boards.findOne({ _id: board._id }))!));
});

export default router;
