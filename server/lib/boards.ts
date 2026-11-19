import { AVATAR_COLORS, DATE_PATTERN, DEFAULT_COLUMNS, DEFAULT_LABELS, LABEL_ID_PATTERN, MAX_CHECKLIST, PRIORITIES, REPEATS, STARTER } from './constants.ts';
import { dayKey, isText, toObjectId } from './helpers.ts';
import { boards, tasks, users } from '../db.ts';
import type { Request } from 'express';
import type { ObjectId } from 'mongodb';
import type { Board, BoardDoc, ChecklistItem, Task, TaskDoc, User } from '../types.ts';

export type Access = 'owner' | 'editor' | 'viewer';
export type TaskFields = Partial<Pick<TaskDoc, 'title' | 'priority' | 'description' | 'dueDate' | 'labels' | 'checklist' | 'repeat' | 'column' | 'assigneeId'>>;

// 📋 Board + task helpers: starter data, access rules (yaar enna paakkalaam / maathalaam), validation

// 🌱 Starter tasks ah oru board la podu
// userId = yaaroda (null = login illaadha ellaarukkum public board)
export async function addStarterTasks(userId: ObjectId | null, boardId: ObjectId): Promise<void> {
  await tasks.insertMany(
    STARTER.map((t, i) => ({ ...t, userId, boardId, order: i, checklist: [], comments: [] }))
  );
}

// 🆕 📋 Ovvoru owner (public / ovvoru user) kkum kuraindhadhu oru board irukkanum
export async function ensureDefaultBoard(userId: ObjectId | null): Promise<Board> {
  const existing = await boards.findOne({ userId }, { sort: { _id: 1 } });
  if (existing) return existing;
  const doc: BoardDoc = {
    userId,
    name: userId ? 'My board' : 'Demo board',
    columns: DEFAULT_COLUMNS.map((c) => ({ ...c })),
    createdAt: new Date(),
  };
  const result = await boards.insertOne(doc);
  return { _id: result.insertedId, ...doc };
}

// 🆕 🔄 Server start aagumbodhu oru thadavai: pazhaya data ah pudhu format ku maathu
export async function runMigrations(): Promise<void> {
  const publicBoard = await ensureDefaultBoard(null);
  await tasks.updateMany({ userId: null, boardId: { $exists: false } }, { $set: { boardId: publicBoard._id } });
  const ownersWithoutBoard = await tasks.distinct('userId', { boardId: { $exists: false }, userId: { $ne: null } });
  for (const owner of ownersWithoutBoard) {
    const board = await ensureDefaultBoard(owner);
    await tasks.updateMany({ userId: owner, boardId: { $exists: false } }, { $set: { boardId: board._id } });
  }

  // Public board kaaliyaa irundhaa mattum starter tasks podu
  if ((await tasks.countDocuments({ boardId: publicBoard._id })) === 0) await addStarterTasks(null, publicBoard._id);
}

// 🔄 MongoDB document ah website ku puriyura maari maathu
export function toTask(doc: Task) {
  return {
    id: doc._id.toString(),
    title: doc.title,
    priority: doc.priority,
    column: doc.column,
    order: doc.order ?? 0, // 🆕 column kulla varisai
    // Pazhaya tasks la intha fields illa (flexible schema!), so default value kudu
    description: doc.description ?? '',
    dueDate: doc.dueDate ?? null,
    labels: doc.labels ?? [],
    checklist: doc.checklist ?? [], // 🆕 ☑️
    assigneeId: doc.assigneeId ? String(doc.assigneeId) : null, // 🆕 👤 yaar seiyanum
    repeat: doc.repeat ?? null, // 🆕 🔁 'daily' | 'weekly' | 'monthly'
    createdAt: doc.createdAt ?? doc._id.getTimestamp(), // 🆕 📊 timeline ku (ObjectId la time irukku)
    timeSpent: doc.timeSpent ?? 0, // 🆕 ⏱️ seconds
    timerStartedAt: doc.timerStartedAt ?? null,
    links: (doc.links ?? []).map((l) => ({ id: l.id, url: l.url, title: l.title, kind: l.kind })), // 🆕 🔗
    attachments: (doc.attachments ?? []).map((a) => ({ id: a.id, name: a.name, size: a.size, type: a.type })), // 🆕 📎
    comments: (doc.comments ?? []).map((c) => ({
      id: c.id,
      text: c.text,
      author: c.author,
      createdAt: c.createdAt,
    })), // 🆕 💬
  };
}

// 📋 Board ah website ku anuppura maari
// 🆕 role = 'owner' (ungal board) illa 'member' (friend share pannadhu), ownerName = yaar board
// 🆕 👀 access = 'owner' | 'editor' | 'viewer' (viewer = paakka mattum, maaththa mudiyaadhu)
export function toBoard(doc: Board, role: 'owner' | 'member' = 'owner', ownerName: string | null = null, access: Access | null = role === 'owner' ? 'owner' : 'editor') {
  return {
    id: doc._id.toString(),
    name: doc.name,
    columns: doc.columns,
    theme: doc.theme ?? 'default', // 🆕 🎨
    labels: boardLabels(doc), // 🆕 🏷️
    role,
    access,
    ownerName,
    memberCount: (doc.members ?? []).length,
  };
}

// 🏷️ Board oda labels (pazhaya boards ku default 4)
export function boardLabels(board: Pick<Board, 'labels'>) {
  return board.labels ?? DEFAULT_LABELS;
}
// Task la board la illaadha label ids ah thookku
export function keepBoardLabels(fields: TaskFields, board: Pick<Board, 'labels'>): void {
  if (!fields.labels) return;
  const ids = new Set(boardLabels(board).map((l) => l.id));
  fields.labels = fields.labels.filter((id) => ids.has(id));
}

// Intha request yaaroda board? (login illana null = public board)
export function boardOwner(req: Request): ObjectId | null {
  return req.user ? req.user._id : null;
}

// 🆕 👑 Intha board intha request oda sondha board ah? (login illana: public board mattum)
export function ownsBoard(req: Request, board: Board | null): boolean {
  return board !== null && String(board.userId) === String(boardOwner(req));
}

// 🆕 👥 Intha board ah paakka / tasks maatha mudiyumaa? (owner illa share panna member)
export function canAccessBoard(req: Request, board: Board | null): boolean {
  if (!board) return false;
  if (ownsBoard(req, board)) return true;
  const user = req.user;
  return Boolean(user) && (board.members ?? []).some((m) => m.equals(user!._id));
}

// 📋 Paakka mudiyura board (owner illa member). boardId sollalana default board
export async function findAccessibleBoard(req: Request, boardId: unknown): Promise<Board | null> {
  if (!boardId) return ensureDefaultBoard(boardOwner(req));
  const _id = toObjectId(boardId);
  const board = _id ? await boards.findOne({ _id }) : null;
  return canAccessBoard(req, board) ? board : null; // illana null: mattavanga board ah thoda mudiyaadhu
}

// 🆕 👑 Owner mattum (peru / columns / members maathu, board azhi, reset)
export async function findMyBoard(req: Request, boardId: unknown): Promise<Board | null> {
  const board = await findAccessibleBoard(req, boardId);
  return ownsBoard(req, board) ? board : null;
}

// 🆕 📝 Task + avanga board, request ku access irundhaa mattum
export async function findAccessibleTask(req: Request, taskId: unknown): Promise<{ task: Task; board: Board } | null> {
  const _id = toObjectId(taskId);
  const task = _id ? await tasks.findOne({ _id }) : null;
  if (!task) return null;
  const board = await boards.findOne({ _id: task.boardId });
  return board && canAccessBoard(req, board) ? { task, board } : null;
}

// 🆕 ✅ Task "done" (kadaisi column) ku pona neram save pannu, veliya vandhaa azhi (stats ku)
// 🆕 🔁 Repeat task mudinjaa adutha copy ah first column la podum. Ethanai pudhu tasks nu thirumba tharum
export async function markCompletion(taskIds: ObjectId[], board: Board, column: string): Promise<number> {
  if (!taskIds.length) return 0;
  const doneColumn = board.columns[board.columns.length - 1]?.id;
  if (column === doneColumn) {
    const repeating = await tasks.find({ _id: { $in: taskIds }, completedAt: null, repeat: { $in: REPEATS } }).toArray();
    await tasks.updateMany({ _id: { $in: taskIds }, completedAt: null }, { $set: { completedAt: new Date() } });
    for (const t of repeating) {
      const { _id, completedAt, remindedFor, comments, attachments, ...rest } = t; // 📎 files copy aagaadhu
      await tasks.insertOne({
        ...rest,
        column: board.columns[0].id,
        order: Date.now(),
        dueDate: nextDueDate(t.dueDate ?? null, t.repeat ?? 'monthly'),
        checklist: (t.checklist ?? []).map((i) => ({ ...i, done: false })), // ☐ ellaam thirumba untick
        comments: [],
      });
      await tasks.updateOne({ _id }, { $set: { repeat: null } }); // pazhasu repeat aagaadhu (rendu thadavai copy vendaam)
    }
    return repeating.length;
  } else {
    await tasks.updateMany({ _id: { $in: taskIds }, completedAt: { $ne: null } }, { $unset: { completedAt: '' } });
  }
  return 0;
}

// 🆕 🔁 Adutha due date: daily +1 naal, weekly +7, monthly +1 maasam (31 → maasaththoda kadaisi naal)
export function nextDueDate(dueDate: string | null, repeat: 'daily' | 'weekly' | 'monthly'): string {
  const base = dueDate ? new Date(`${dueDate}T00:00`) : new Date();
  base.setHours(0, 0, 0, 0);
  if (repeat === 'daily') base.setDate(base.getDate() + 1);
  else if (repeat === 'weekly') base.setDate(base.getDate() + 7);
  else {
    const day = base.getDate();
    base.setDate(1);
    base.setMonth(base.getMonth() + 1);
    const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    base.setDate(Math.min(day, lastDay));
  }
  return dayKey(base);
}

// 🆕 👥 Intha board la irukkura ellaarum (owner + members)
export function boardPeople(board: Board): ObjectId[] {
  return [board.userId, ...(board.members ?? [])].filter((id): id is ObjectId => Boolean(id));
}

// 🆕 🧹 Task fields ah check panni suththam pannu (create, update, AI bulk: ellaarum use pannuvaanga)
// Returns { fields } illa { error }
export function cleanTaskFields(body: Record<string, any>, { requireTitle }: { requireTitle: boolean }): { fields: TaskFields; error?: string } {
  const fields: TaskFields = {};
  if (requireTitle || 'title' in body) {
    if (!isText(body.title) || !body.title.trim()) return { fields: {}, error: 'Task title is required.' };
    fields.title = body.title.trim().slice(0, 80);
  }
  if ('priority' in body) {
    if (!PRIORITIES.includes(body.priority)) return { fields: {}, error: 'Invalid priority.' };
    fields.priority = body.priority;
  }
  if ('description' in body) {
    if (!isText(body.description)) return { fields: {}, error: 'Invalid description.' };
    fields.description = body.description.trim().slice(0, 1000);
  }
  if ('dueDate' in body) {
    const d = body.dueDate;
    const ok = d === null || (isText(d) && DATE_PATTERN.test(d) && !Number.isNaN(Date.parse(d)));
    if (!ok) return { fields: {}, error: 'Invalid due date.' };
    fields.dueDate = d;
  }
  if ('labels' in body) {
    // Id format mattum inga; board la irukkura label aa nu keepBoardLabels() paakkum
    const ok = Array.isArray(body.labels) && body.labels.length <= 12 && body.labels.every((l: unknown) => isText(l) && LABEL_ID_PATTERN.test(l));
    if (!ok) return { fields: {}, error: 'Invalid labels.' };
    fields.labels = [...new Set(body.labels as string[])]; // 🧹 duplicate labels eduthudu
  }
  if ('checklist' in body) {
    // ☑️ [{ id, text, done }] (max 30, ezhuthu max 120)
    const list = body.checklist;
    const ok =
      Array.isArray(list) &&
      list.length <= MAX_CHECKLIST &&
      list.every((i: any) => i && isText(i.id) && i.id.length <= 40 && isText(i.text) && i.text.trim() && typeof i.done === 'boolean');
    if (!ok) return { fields: {}, error: 'Invalid checklist.' };
    fields.checklist = list.map((i: ChecklistItem) => ({ id: i.id, text: i.text.trim().slice(0, 120), done: i.done }));
  }
  if ('repeat' in body) {
    if (body.repeat !== null && !REPEATS.includes(body.repeat)) return { fields: {}, error: 'Invalid repeat.' };
    fields.repeat = body.repeat;
  }
  return { fields };
}

// 🆕 👥 Board members list (owner + share panna friends)
// 🆕 👀 Intha user ku intha board la endha power?
export function accessOf(req: Request, board: Board | null): Access | null {
  if (!board) return null;
  if (ownsBoard(req, board)) return 'owner';
  const user = req.user;
  if (!user || !(board.members ?? []).some((m) => m.equals(user._id))) return null;
  return (board.viewers ?? []).some((v) => v.equals(user._id)) ? 'viewer' : 'editor';
}

// ✏️ Maaththa mudiyumaa? (owner illa editor)
export function canEditBoard(req: Request, board: Board | null): boolean {
  const access = accessOf(req, board);
  return access === 'owner' || access === 'editor';
}

export const VIEW_ONLY = { error: 'You have view-only access to this board.' };

export async function membersPayload(board: Board) {
  const people = await users
    .find({ _id: { $in: boardPeople(board) } }, { projection: { name: 1, email: 1, avatarColor: 1 } })
    .toArray();
  const viewers = new Set((board.viewers ?? []).map(String));
  const toPerson = (u: Pick<User, '_id' | 'name' | 'email' | 'avatarColor'>) => ({
    id: u._id.toString(),
    name: u.name,
    email: u.email,
    avatarColor: u.avatarColor ?? AVATAR_COLORS[0],
    role: board.userId && u._id.equals(board.userId) ? 'owner' : viewers.has(String(u._id)) ? 'viewer' : 'editor', // 🆕 👀
  });
  const owner = people.find((u) => board.userId && u._id.equals(board.userId));
  return {
    owner: owner ? toPerson(owner) : null,
    members: people.filter((u) => !(board.userId && u._id.equals(board.userId))).map(toPerson),
  };
}
