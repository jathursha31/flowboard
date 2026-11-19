// 🟦 Server anuppura data oda shape (website muzhukka use aagum)

export type Priority = 'low' | 'medium' | 'high';
export type Repeat = 'daily' | 'weekly' | 'monthly';
export type Access = 'owner' | 'editor' | 'viewer';

export interface User {
  name: string;
  email: string;
  avatarColor: string;
  hasPassword?: boolean;
  plan?: 'free' | 'pro'; // 💎
}

export interface Column {
  id: string;
  title: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Comment {
  id: string;
  text: string;
  author: string;
  createdAt: string;
}

// 🔗 Google Drive / Docs / web link
export interface TaskLink {
  id: string;
  url: string;
  title: string;
  kind: 'drive' | 'docs' | 'sheets' | 'slides' | 'forms' | 'link';
}

export interface Attachment {
  id: string;
  name: string;
  size: number;
  type: string;
}

export interface Task {
  id: string;
  title: string;
  priority: Priority;
  column: string;
  order: number;
  description: string;
  dueDate: string | null;
  labels: string[];
  checklist: ChecklistItem[];
  comments: Comment[];
  attachments: Attachment[];
  assigneeId: string | null;
  repeat: Repeat | null;
  createdAt?: string;
  links?: TaskLink[]; // 🔗
  timeSpent?: number; // ⏱️ seconds
  timerStartedAt?: string | null; // ⏱️ oadikittu irundhaa
}

// 🏷️ Board la neengale create panna label
export interface Label {
  id: string;
  name: string;
  color: string;
}
export const LABEL_COLORS = ['violet', 'red', 'cyan', 'orange', 'green', 'blue', 'pink', 'gray'];
export const DEFAULT_LABELS: Label[] = [
  { id: 'design', name: 'design', color: 'violet' },
  { id: 'bug', name: 'bug', color: 'red' },
  { id: 'feature', name: 'feature', color: 'cyan' },
  { id: 'urgent', name: 'urgent', color: 'orange' },
];

export interface Board {
  id: string;
  name: string;
  columns: Column[];
  theme: string;
  labels?: Label[]; // 🏷️ (pazhaya cache la illaama irukkalaam)
  role: 'owner' | 'member';
  access?: Access;
  ownerName: string | null;
  memberCount: number;
}

export interface Person {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  role?: Access;
}

export interface Notification {
  id: string;
  type: string;
  text: string;
  boardId: string | null;
  taskId: string | null;
  read: boolean;
  createdAt: string;
}

export interface ActivityEntry {
  id: string;
  taskId: string;
  taskTitle: string;
  actorName: string;
  action: string;
  detail: string;
  createdAt: string;
}
