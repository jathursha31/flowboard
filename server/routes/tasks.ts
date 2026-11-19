import express from 'express';
import crypto from 'node:crypto';
import { DEFAULT_COLUMNS, MAX_COMMENTS } from '../lib/constants.ts';
import { isText, must, toObjectId } from '../lib/helpers.ts';
import { requireUser } from '../lib/auth.ts';
import { VIEW_ONLY, addStarterTasks, boardOwner, boardPeople, canEditBoard, cleanTaskFields, findAccessibleBoard, keepBoardLabels, findAccessibleTask, findMyBoard, markCompletion, toBoard, toTask } from '../lib/boards.ts';
import { boards, tasks } from '../db.ts';
import { publish } from '../lib/realtime.ts';
import { notify } from '../lib/notify.ts';
import { deleteFilesWhere } from '../lib/attachments.ts';
import { logActivity } from '../lib/activity.ts';
import { findMentioned } from '../lib/mentions.ts';
import { MAX_LINKS, cleanLinkUrl, linkKind, linkTitle } from '../lib/links.ts';
import { users } from '../db.ts';
import type { ObjectId } from 'mongodb';
import type { TaskDoc } from '../types.ts';

// 📝 Tasks: CRUD, reorder, comments, reset
const router = express.Router();

// 👀 READ: intha board oda tasks (column kulla varisai padi)
router.get('/api/tasks', async (req, res) => {
  const board = await findAccessibleBoard(req, req.query.boardId);
  if (!board) return res.status(404).json({ error: 'Board not found.' });
  const all = await tasks.find({ boardId: board._id }).sort({ order: 1, _id: 1 }).toArray();
  res.json(all.map(toTask));
});

// ➕ CREATE: pudhu task add
router.post('/api/tasks', async (req, res) => {
  const body = req.body || {};
  const board = await findAccessibleBoard(req, body.boardId);
  if (!board) return res.status(404).json({ error: 'Board not found.' });
  if (!canEditBoard(req, board)) return res.status(403).json(VIEW_ONLY); // 👀

  const { fields, error } = cleanTaskFields(body, { requireTitle: true });
  if (error) return res.status(400).json({ error });
  keepBoardLabels(fields, board); // 🏷️

  // Column sollalana board oda mudhal column
  const column = isText(body.column) ? body.column : board.columns[0].id;
  if (!board.columns.some((c) => c.id === column)) return res.status(400).json({ error: 'Invalid column.' });

  const doc: TaskDoc = {
    priority: 'medium',
    description: '',
    dueDate: null,
    labels: [],
    checklist: [],
    comments: [],
    ...fields,
    column,
    order: Date.now(), // pudhusu = column kadaisila
    boardId: board._id,
    userId: board.userId, // 🆕 task = board owner odadhu (share pannaalum)
    createdBy: boardOwner(req), // 🆕 yaar create pannaanga
  } as TaskDoc;
  const result = await tasks.insertOne(doc);

  console.log('➕ Pudhu task:', doc.title);
  await logActivity(req, board, { _id: result.insertedId, title: doc.title }, 'created'); // 🕓
  publish(board._id, 'tasks', req); // ⚡ mattha tabs / friends ku
  res.status(201).json(toTask({ _id: result.insertedId, ...doc }));
});

// ➕➕ Pala tasks ore thadavai (AI suggestions "Add all") - max 15
router.post('/api/tasks/bulk', requireUser, async (req, res) => {
  const body = req.body || {};
  const board = await findAccessibleBoard(req, body.boardId);
  if (!board) return res.status(404).json({ error: 'Board not found.' });
  if (!canEditBoard(req, board)) return res.status(403).json(VIEW_ONLY);
  if (!Array.isArray(body.tasks) || body.tasks.length === 0 || body.tasks.length > 15) {
    return res.status(400).json({ error: 'Send 1 to 15 tasks.' });
  }

  const now = Date.now();
  const docs: TaskDoc[] = [];
  for (const [i, t] of body.tasks.entries()) {
    const { fields, error } = cleanTaskFields(t || {}, { requireTitle: true });
    if (error) return res.status(400).json({ error });
    keepBoardLabels(fields, board);
    docs.push({
      priority: 'medium',
      description: '',
      dueDate: null,
      labels: [],
      checklist: [],
      comments: [],
      ...fields,
      column: board.columns[0].id,
      order: now + i,
      boardId: board._id,
      userId: board.userId,
      createdBy: req.user!._id,
    } as TaskDoc);
  }
  const result = await tasks.insertMany(docs);
  console.log('➕ AI tasks added:', docs.length);
  for (const [i, d] of docs.entries()) await logActivity(req, board, { _id: result.insertedIds[i], title: d.title }, 'created', 'from AI');
  publish(board._id, 'tasks', req);
  res.status(201).json(docs.map((d, i) => toTask({ _id: result.insertedIds[i], ...d })));
});

// ✏️ UPDATE: task la edhaavadhu maathu (column, title, priority, description, dueDate, labels, checklist)
router.patch('/api/tasks/:id', async (req, res) => {
  // 🛡️ Board access illana mattavanga task ah maatha mudiyaadhu!
  const found = await findAccessibleTask(req, req.params.id);
  if (!found) return res.status(404).json({ error: 'Task kidaikkala!' });
  if (!canEditBoard(req, found.board)) return res.status(403).json(VIEW_ONLY);
  const { task, board } = found;

  const body = req.body || {};
  const { fields, error } = cleanTaskFields(body, { requireTitle: false });
  if (error) return res.status(400).json({ error });
  keepBoardLabels(fields, board); // 🏷️ board la irukkura labels mattum

  if ('column' in body) {
    if (!board.columns.some((c) => c.id === body.column)) return res.status(400).json({ error: 'Thappaana column!' });
    fields.column = body.column;
  }

  // 🆕 👤 Assign: board la irukkuravangalukku mattum (illa null = yaarukkum illa)
  if ('assigneeId' in body) {
    if (body.assigneeId === null) fields.assigneeId = null;
    else {
      const person = boardPeople(board).find((id) => String(id) === String(body.assigneeId));
      if (!person) return res.status(400).json({ error: 'That person is not on this board.' });
      fields.assigneeId = person;
    }
  }

  if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'Nothing to update.' });

  await tasks.updateOne({ _id: task._id }, { $set: fields });
  if (fields.column) await markCompletion([task._id], board, fields.column); // 🆕 ✅ stats ku (+ 🔁 repeat)
  const updated = must(await tasks.findOne({ _id: task._id }));

  // 🔔 Pudhusaa assign pannaa avangalukku sollu
  if (fields.assigneeId && String(fields.assigneeId) !== String(task.assigneeId)) {
    const who = req.user ? req.user.name : 'Someone';
    await notify(fields.assigneeId, { type: 'assigned', text: `${who} assigned you "${updated.title}"`, boardId: board._id, taskId: task._id }, req.user?._id);
  }

  // 🕓 History: move / assign / matha maatram
  const columnTitle = (id: string) => board.columns.find((c) => c.id === id)?.title ?? id;
  if (fields.column && fields.column !== task.column) {
    const done = fields.column === board.columns.at(-1)?.id;
    await logActivity(req, board, updated, done ? 'completed' : 'moved', columnTitle(fields.column));
  }
  if ('assigneeId' in fields && String(fields.assigneeId) !== String(task.assigneeId)) {
    const person = fields.assigneeId && (await users.findOne({ _id: fields.assigneeId }, { projection: { name: 1 } }));
    await logActivity(req, board, updated, 'assigned', person ? person.name : 'nobody');
  }
  const edited = (Object.keys(fields) as (keyof typeof fields)[]).filter((k) => !['column', 'assigneeId'].includes(k) && JSON.stringify(fields[k]) !== JSON.stringify(task[k] ?? null));
  if (edited.length) await logActivity(req, board, updated, 'edited', edited.join(', '));
  publish(board._id, 'tasks', req);

  console.log('✏️ Task', req.params.id, 'update:', Object.keys(fields).join(', '));
  res.json(toTask(updated));
});

// ↕️ REORDER: oru column la tasks oda varisai (drag & drop apram)
router.post('/api/tasks/reorder', async (req, res) => {
  const body = req.body || {};
  const board = await findAccessibleBoard(req, body.boardId);
  if (!board) return res.status(404).json({ error: 'Board not found.' });
  if (!canEditBoard(req, board)) return res.status(403).json(VIEW_ONLY);
  if (!board.columns.some((c) => c.id === body.column)) return res.status(400).json({ error: 'Invalid column.' });
  if (!Array.isArray(body.ids) || body.ids.length > 500) return res.status(400).json({ error: 'Invalid order.' });

  const maybeIds = (body.ids as unknown[]).map(toObjectId);
  if (maybeIds.some((id) => !id)) return res.status(400).json({ error: 'Invalid order.' });
  const ids = maybeIds as ObjectId[];
  const movedId = toObjectId(body.movedId);
  const movedBefore = movedId && (await tasks.findOne({ _id: movedId, boardId: board._id }));

  // 📦 Ellaa updates um ore trip la (bulkWrite) - ovvonnukkum thani request vendaam
  if (ids.length) {
    await tasks.bulkWrite(
      ids.map((_id, i) => ({
        updateOne: {
          filter: { _id, boardId: board._id }, // 🛡️ intha board tasks mattum
          update: { $set: { column: body.column, order: i } },
        },
      }))
    );
  }

  // 🆕 ✅ Move aana task "done" ku pochaa nu note (stats ku)
  const moved = toObjectId(body.movedId);
  let repeated = 0;
  if (moved && ids.some((id) => id.equals(moved))) repeated = await markCompletion([moved], board, body.column);
  if (movedBefore && movedBefore.column !== body.column) {
    const done = body.column === board.columns.at(-1)?.id;
    await logActivity(req, board, movedBefore, done ? 'completed' : 'moved', board.columns.find((c) => c.id === body.column)?.title);
  }

  publish(board._id, 'tasks', req);
  res.json({ ok: true, repeated }); // 🆕 🔁 repeated > 0 na website tasks ah thirumba edukkum
});

// 🗑️ DELETE: task azhi
router.delete('/api/tasks/:id', async (req, res) => {
  const found = await findAccessibleTask(req, req.params.id);
  if (found && !canEditBoard(req, found.board)) return res.status(403).json(VIEW_ONLY);
  if (found) {
    await tasks.deleteOne({ _id: found.task._id });
    await deleteFilesWhere({ 'metadata.taskId': found.task._id }); // 📎 avanga files um
    await logActivity(req, found.board, found.task, 'deleted');
    publish(found.board._id, 'tasks', req);
  }
  console.log('🗑️ Task', req.params.id, 'azhichiduchu');
  res.json({ ok: true });
});

// 🔗 LINKS: Google Drive / Docs / Sheets / Slides illa vera https link (max 10)
router.post('/api/tasks/:id/links', async (req, res) => {
  const found = await findAccessibleTask(req, req.params.id);
  if (!found) return res.status(404).json({ error: 'Task kidaikkala!' });
  if (!canEditBoard(req, found.board)) return res.status(403).json(VIEW_ONLY);
  const url = cleanLinkUrl(req.body?.url);
  if (!url) return res.status(400).json({ error: 'Paste a link that starts with https://' });
  if ((found.task.links ?? []).length >= MAX_LINKS) return res.status(400).json({ error: `A task can have up to ${MAX_LINKS} links.` });
  const kind = linkKind(url);
  const link = { id: crypto.randomUUID(), url, title: linkTitle(req.body?.title, url, kind), kind, addedAt: new Date() };
  const updated = must(await tasks.findOneAndUpdate({ _id: found.task._id }, { $push: { links: link } }, { returnDocument: 'after' }));
  await logActivity(req, found.board, updated, 'attached', link.title);
  publish(found.board._id, 'tasks', req);
  res.status(201).json(toTask(updated));
});

router.delete('/api/tasks/:id/links/:linkId', async (req, res) => {
  const found = await findAccessibleTask(req, req.params.id);
  if (!found) return res.status(404).json({ error: 'Task kidaikkala!' });
  if (!canEditBoard(req, found.board)) return res.status(403).json(VIEW_ONLY);
  const updated = must(await tasks.findOneAndUpdate({ _id: found.task._id }, { $pull: { links: { id: req.params.linkId } } }, { returnDocument: 'after' }));
  publish(found.board._id, 'tasks', req);
  res.json(toTask(updated));
});

// ⏱️ TIMER: start / stop / reset. Oruthar ku ore neraththula oru timer mattum (vera task la start pannaa adhu nikkum)
const MAX_SESSION = 12 * 60 * 60; // 12 mani ku mela (timer ah marandhaa) count pannaadhe
const elapsed = (from: Date | null | undefined) => (from ? Math.min(MAX_SESSION, Math.max(0, Math.round((Date.now() - from.getTime()) / 1000))) : 0);

async function stopTimersOf(userId: ObjectId, exceptTaskId?: ObjectId): Promise<ObjectId[]> {
  const running = await tasks.find({ timerBy: userId, timerStartedAt: { $ne: null }, ...(exceptTaskId && { _id: { $ne: exceptTaskId } }) }).toArray();
  for (const t of running) {
    await tasks.updateOne({ _id: t._id }, { $inc: { timeSpent: elapsed(t.timerStartedAt) }, $set: { timerStartedAt: null, timerBy: null } });
  }
  return [...new Map(running.map((t) => [String(t.boardId), t.boardId])).values()]; // endha boards la maarichu (live update ku)
}

router.post('/api/tasks/:id/timer', requireUser, async (req, res) => {
  const found = await findAccessibleTask(req, req.params.id);
  if (!found) return res.status(404).json({ error: 'Task kidaikkala!' });
  if (!canEditBoard(req, found.board)) return res.status(403).json(VIEW_ONLY);
  const { task, board } = found;
  const action = req.body?.action;
  const me = req.user!._id;

  if (action === 'start') {
    if (task.timerStartedAt) return res.status(409).json({ error: 'The timer is already running.' });
    for (const other of await stopTimersOf(me, task._id)) if (!other.equals(board._id)) publish(other, 'tasks', req);
    await tasks.updateOne({ _id: task._id }, { $set: { timerStartedAt: new Date(), timerBy: me } });
  } else if (action === 'stop') {
    if (!task.timerStartedAt) return res.status(409).json({ error: 'The timer is not running.' });
    await tasks.updateOne({ _id: task._id }, { $inc: { timeSpent: elapsed(task.timerStartedAt) }, $set: { timerStartedAt: null, timerBy: null } });
  } else if (action === 'reset') {
    await tasks.updateOne({ _id: task._id }, { $set: { timeSpent: 0, timerStartedAt: null, timerBy: null } });
  } else {
    return res.status(400).json({ error: 'action must be start, stop or reset.' });
  }
  publish(board._id, 'tasks', req);
  res.json(toTask(must(await tasks.findOne({ _id: task._id }))));
});

// 💬 Task la comment podu
router.post('/api/tasks/:id/comments', async (req, res) => {
  const found = await findAccessibleTask(req, req.params.id);
  if (!found) return res.status(404).json({ error: 'Task kidaikkala!' });
  if (!canEditBoard(req, found.board)) return res.status(403).json(VIEW_ONLY);
  const { text } = req.body || {};
  if (!isText(text) || !text.trim()) return res.status(400).json({ error: 'Comment is empty.' });

  const comment = {
    id: crypto.randomUUID(),
    text: text.trim().slice(0, 500),
    author: req.user ? req.user.name : 'Guest',
    createdAt: new Date(),
  };
  // $push + $slice: -100 = kadaisi 100 comments mattum vechukko
  const updated = must(await tasks.findOneAndUpdate(
    { _id: found.task._id },
    { $push: { comments: { $each: [comment], $slice: -MAX_COMMENTS } } },
    { returnDocument: 'after' }
  ));
  // 💬 @mentions: board la irukkura "@Bala" ku notification
  const people = await users.find({ _id: { $in: boardPeople(found.board) } }, { projection: { name: 1 } }).toArray();
  const mentioned = findMentioned(comment.text, people);
  for (const p of mentioned) {
    await notify(p._id, { type: 'mention', text: `${comment.author} mentioned you on "${updated.title}"`, boardId: found.board._id, taskId: found.task._id }, req.user?._id);
  }

  // 🔔 Assign aanavangalukku "puthu comment" nu sollu (mention la already sonnaa thirumba vendaam)
  if (!mentioned.some((p) => String(p._id) === String(found.task.assigneeId))) {
    await notify(
      found.task.assigneeId,
      { type: 'comment', text: `${comment.author} commented on "${updated.title}"`, boardId: found.board._id, taskId: found.task._id },
      req.user?._id
    );
  }
  await logActivity(req, found.board, updated, 'commented', comment.text.slice(0, 60));
  publish(found.board._id, 'tasks', req);
  res.status(201).json(toTask(updated));
});

// 💬🗑️ Comment azhi
router.delete('/api/tasks/:id/comments/:commentId', async (req, res) => {
  const found = await findAccessibleTask(req, req.params.id);
  if (!found) return res.status(404).json({ error: 'Task kidaikkala!' });
  if (!canEditBoard(req, found.board)) return res.status(403).json(VIEW_ONLY);
  const updated = must(await tasks.findOneAndUpdate(
    { _id: found.task._id },
    { $pull: { comments: { id: req.params.commentId } } },
    { returnDocument: 'after' }
  ));
  publish(found.board._id, 'tasks', req);
  res.json(toTask(updated));
});

// 🔄 RESET: intha board ah mattum starter tasks ku reset (owner mattum)
router.post('/api/tasks/reset', async (req, res) => {
  const board = await findMyBoard(req, req.body?.boardId);
  if (!board) return res.status(403).json({ error: 'Only the board owner can reset it.' });

  // Starter tasks oda columns (todo/doing/done) board la illana, board columns ah default ku thirumba
  const hasDefaults = DEFAULT_COLUMNS.every((d) => board.columns.some((c) => c.id === d.id));
  if (!hasDefaults) await boards.updateOne({ _id: board._id }, { $set: { columns: DEFAULT_COLUMNS } });

  await tasks.deleteMany({ boardId: board._id });
  await deleteFilesWhere({ 'metadata.boardId': board._id }); // 📎
  await addStarterTasks(board.userId, board._id);
  const all = await tasks.find({ boardId: board._id }).sort({ order: 1, _id: 1 }).toArray();
  publish(board._id, 'board', req);
  res.json({ tasks: all.map(toTask), board: toBoard({ ...board, columns: hasDefaults ? board.columns : DEFAULT_COLUMNS }) });
});

export default router;
