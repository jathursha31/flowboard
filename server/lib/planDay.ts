import { dayKey } from './helpers.ts';

// 🌅 "Plan my day": innaikku endha 3 tasks mudhalla pannanum?
// AI key illana (illa AI fail aanaa) intha simple rules: late → innaikku → naalaikku → priority

export interface Candidate {
  id: string;
  title: string;
  priority: 'low' | 'medium' | 'high';
  dueDate: string | null;
  boardId: string;
  boardName: string;
  assignedToMe: boolean;
}

// 🌐 why = kaaranam code (website ovvoru mozhilayum translate pannum), reason = English
export interface Why {
  key: 'overdue' | 'today' | 'tomorrow' | 'soon' | 'priority';
  n?: number;
  mine: boolean;
}

export interface Pick {
  task: Candidate;
  reason: string;
  why?: Why;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00`) - Date.parse(`${from}T00:00`)) / DAY_MS);
}

// Ovvoru task kkum oru "evlo avasaram" score + kaaranam
export function scoreTask(task: Candidate, today: string): { score: number; reason: string; why: Why } {
  let score = { high: 30, medium: 15, low: 5 }[task.priority];
  let reason = `${task.priority[0].toUpperCase()}${task.priority.slice(1)} priority`;
  const why: Why = { key: 'priority', mine: task.assignedToMe };
  if (task.dueDate) {
    const days = daysBetween(today, task.dueDate);
    if (days < 0) {
      score += 100 + Math.min(-days, 30);
      reason = `Overdue by ${-days} day${days === -1 ? '' : 's'}`;
      Object.assign(why, { key: 'overdue', n: -days });
    } else if (days === 0) {
      score += 80;
      reason = 'Due today';
      why.key = 'today';
    } else if (days === 1) {
      score += 60;
      reason = 'Due tomorrow';
      why.key = 'tomorrow';
    } else if (days <= 7) {
      score += 40 - days * 3;
      reason = `Due in ${days} days`;
      Object.assign(why, { key: 'soon', n: days });
    }
  }
  if (task.assignedToMe) {
    score += 10;
    reason += ' · assigned to you';
  }
  return { score, reason, why };
}

export function planDayHeuristic(candidates: Candidate[], now = new Date(), count = 3): Pick[] {
  const today = dayKey(now);
  return candidates
    .map((task) => ({ task, ...scoreTask(task, today) }))
    .sort((a, b) => b.score - a.score || (a.task.dueDate ?? '9999').localeCompare(b.task.dueDate ?? '9999'))
    .slice(0, count)
    .map(({ task, reason, why }) => ({ task, reason, why }));
}
