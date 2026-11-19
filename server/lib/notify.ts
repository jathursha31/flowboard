import { notifications, tasks, boards } from '../db.ts';
import { sendPush } from './push.ts';
import { dayKey } from './helpers.ts';
import type { ObjectId } from 'mongodb';

interface NotificationInput {
  type: string;
  text: string;
  boardId?: ObjectId | null;
  taskId?: ObjectId | null;
}

// 🔔 Notifications: "Anu assigned you a task", "Bala commented", "📅 Due tomorrow"

// Oruthar ku notification podu (thannoda velai ku thanakke vendaam)
export async function notify(userId: ObjectId | null | undefined, { type, text, boardId = null, taskId = null }: NotificationInput, actorId: ObjectId | null = null): Promise<void> {
  if (!userId || (actorId && String(userId) === String(actorId))) return;
  await notifications.insertOne({ userId, type, text: text.slice(0, 200), boardId, taskId, read: false, createdAt: new Date() });
  // 🔔 Phone / computer ku um (background la: fail aanaalum vela nikkaadhu)
  const url = boardId ? `/app?board=${boardId}${taskId ? `&task=${taskId}` : ''}` : '/app';
  sendPush(userId, { title: 'Flowboard', body: text, url }).catch((err) => console.log('⚠️ Push:', (err as Error).message));
}

// 📅 Innaikku / naalaikku due aagura, innum mudiyaadha tasks ku reminder (oru due date ku oru thadavai)
// index.js ithai mani ku oru thadavai oadum
export async function sendDueReminders(now = new Date()) {
  const today = dayKey(now);
  const tomorrow = dayKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));

  const due = await tasks
    .find({ dueDate: { $in: [today, tomorrow] }, userId: { $ne: null }, $expr: { $ne: ['$remindedFor', '$dueDate'] } })
    .toArray();
  if (!due.length) return 0;

  const boardIds = [...new Map(due.map((t) => [String(t.boardId), t.boardId])).values()]; // duplicate illaama
  const boardList = await boards.find({ _id: { $in: boardIds } }).toArray();
  const doneOf = new Map(boardList.map((b) => [String(b._id), b.columns.at(-1)?.id]));

  let sent = 0;
  for (const task of due) {
    if (task.column === doneOf.get(String(task.boardId))) continue; // mudinjiduchu, reminder vendaam
    const when = task.dueDate === today ? 'today' : 'tomorrow';
    await notify(task.assigneeId ?? task.userId, {
      type: 'due',
      text: `📅 "${task.title}" is due ${when}`,
      boardId: task.boardId,
      taskId: task._id,
    });
    await tasks.updateOne({ _id: task._id }, { $set: { remindedFor: task.dueDate ?? undefined } });
    sent++;
  }
  return sent;
}
