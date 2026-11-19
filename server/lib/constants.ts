
// 🔒 App muzhukka use aagura fixed values (rules + limits)

// 🔒 Ithu mattum dhaan allowed
export type Priority = 'low' | 'medium' | 'high';
export type Repeat = 'daily' | 'weekly' | 'monthly';
export interface Column {
  id: string;
  title: string;
}

export const PRIORITIES: Priority[] = ['low', 'medium', 'high'];
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const LABELS: string[] = ['design', 'bug', 'feature', 'urgent']; // 🏷️ default label ids (import / pazhaya boards)
// 🆕 🏷️ Custom labels: board owner peru + colour maathalaam
export const LABEL_COLORS = ['violet', 'red', 'cyan', 'orange', 'green', 'blue', 'pink', 'gray'];
export const DEFAULT_LABELS = [
  { id: 'design', name: 'design', color: 'violet' },
  { id: 'bug', name: 'bug', color: 'red' },
  { id: 'feature', name: 'feature', color: 'cyan' },
  { id: 'urgent', name: 'urgent', color: 'orange' },
];
export const MAX_LABELS = 12;
export const LABEL_ID_PATTERN = /^[a-z0-9-]{1,24}$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/; // 📅 "2026-10-30" maari
export const COLUMN_ID_PATTERN = /^[a-z0-9-]{1,30}$/; // 🆕 column id: "todo", "review-2" maari
export const BANNER_TONES: string[] = ['info', 'success', 'warning']; // 🆕 📢 banner colour
export const BOARD_THEMES: string[] = ['default', 'ocean', 'forest', 'sunset', 'berry', 'slate']; // 🆕 🎨 board background

// 🆕 📋 Pudhu board la aarambathula irukkura columns
export const DEFAULT_COLUMNS: Column[] = [
  { id: 'todo', title: 'To do' },
  { id: 'doing', title: 'In progress' },
  { id: 'done', title: 'Done' },
];

// 🆕 🔢 Limits (oruthar database ah nirappa koodaadhu). Boards / members limit plan padi: lib/billing.ts PLAN_LIMITS
export const MAX_COLUMNS = 8;
export const MAX_CHECKLIST = 30;
export const MAX_COMMENTS = 100;

// 🌱 Aarambathula irukkura tasks
export const STARTER: { title: string; priority: Priority; column: string }[] = [
  { title: 'Design new onboarding flow', priority: 'high', column: 'todo' },
  { title: 'Write API documentation', priority: 'medium', column: 'todo' },
  { title: 'Fix login redirect bug', priority: 'high', column: 'doing' },
  { title: 'User interviews – round 2', priority: 'low', column: 'doing' },
  { title: 'Set up CI pipeline', priority: 'medium', column: 'done' },
];

// 🆕 🎨 Avatar colours (user choose pannalaam)
export const AVATAR_COLORS: string[] = ['#5b5bf0', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#64748b'];
export const REPEATS: Repeat[] = ['daily', 'weekly', 'monthly']; // 🆕 🔁 repeat tasks
