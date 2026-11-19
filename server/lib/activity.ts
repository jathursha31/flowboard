import type { Request } from 'express';
import type { ObjectId } from 'mongodb';
import { activity } from '../db.ts';
import { fireWebhooks } from './webhooks.ts';

// 🕓 Activity history: "Anu moved 'Logo' to Done · 2 min ago"

export type ActivityAction = 'created' | 'edited' | 'moved' | 'completed' | 'assigned' | 'commented' | 'attached' | 'deleted';

interface BoardLike {
  _id: ObjectId;
  name?: string;
}
interface TaskLike {
  _id: ObjectId;
  title: string;
}
interface UserLike {
  _id: ObjectId;
  name: string;
}

// Oru action ah record pannu (fail aanaalum main velai nikkakoodaadhu)
export async function logActivity(
  req: Request & { user?: UserLike | null },
  board: BoardLike,
  task: TaskLike,
  action: ActivityAction,
  detail = ''
): Promise<void> {
  try {
    await activity.insertOne({
      boardId: board._id,
      taskId: task._id,
      taskTitle: task.title.slice(0, 80),
      actorId: req.user?._id ?? null,
      actorName: req.user?.name ?? 'Guest',
      action,
      detail: detail.slice(0, 120),
      createdAt: new Date(),
    });
  } catch (err) {
    console.log('⚠️ Activity log ezhudha mudiyala:', (err as Error).message);
  }
  // 🪝 Webhooks ku um sollu ("task.moved" maari)
  fireWebhooks(board._id, `task.${action}`, {
    board: { id: String(board._id), name: board.name ?? '' },
    task: { id: String(task._id), title: task.title },
    actor: { name: req.user?.name ?? 'Guest', viaApiKey: Boolean(req.apiKey) },
    detail,
  });
}

export interface ActivityEntry {
  id: string;
  taskId: string;
  taskTitle: string;
  actorName: string;
  action: ActivityAction;
  detail: string;
  createdAt: Date;
}

// Website ku anuppura format
export function toActivity(doc: Record<string, any>): ActivityEntry {
  return {
    id: String(doc._id),
    taskId: String(doc.taskId),
    taskTitle: doc.taskTitle,
    actorName: doc.actorName,
    action: doc.action,
    detail: doc.detail ?? '',
    createdAt: doc.createdAt,
  };
}
