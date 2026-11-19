// 📦 Import: Flowboard backup illa Trello export JSON → namma boards + tasks
// Ellaa values um check panni vettu (yaaro anuppura file ah nambakoodaadhu)

import type { Priority } from './constants.ts';
import { DEFAULT_COLUMNS, LABELS } from './constants.ts';

export const MAX_IMPORT_BOARDS = 10;
export const MAX_IMPORT_TASKS = 500; // oru board ku
const MAX_COLUMNS = 8;

export interface ImportedTask {
  title: string;
  description: string;
  priority: Priority;
  column: string;
  dueDate: string | null;
  labels: string[];
  checklist: { id: string; text: string; done: boolean }[];
}

export interface ImportedBoard {
  name: string;
  columns: { id: string; title: string }[];
  tasks: ImportedTask[];
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const asArray = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function slug(text: string, used: Set<string>): string {
  const base = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20) || 'col';
  let id = base;
  for (let i = 2; used.has(id); i++) id = `${base}-${i}`.slice(0, 30);
  used.add(id);
  return id;
}

function cleanColumns(list: { title: string }[]): { id: string; title: string }[] {
  const used = new Set<string>();
  const cols = list.filter((c) => c.title).slice(0, MAX_COLUMNS).map((c) => ({ id: slug(c.title, used), title: c.title.slice(0, 30) }));
  return cols.length ? cols : DEFAULT_COLUMNS.map((c) => ({ ...c }));
}

function cleanDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const day = v.slice(0, 10);
  return DATE.test(day) && !Number.isNaN(Date.parse(day)) ? day : null;
}

const PRIORITY_SET = new Set(['low', 'medium', 'high']);

// ---------- Flowboard backup (GET /api/account/export) ----------
function fromFlowboard(data: any): ImportedBoard[] {
  return asArray(data.boards)
    .slice(0, MAX_IMPORT_BOARDS)
    .map((b) => {
      const columns = cleanColumns(asArray(b.columns).map((c) => ({ title: str(c?.title, 30) })));
      const titleToId = new Map(asArray(b.columns).map((c, i) => [str(c?.id, 30), columns[i]?.id]));
      const tasks = asArray(b.tasks)
        .slice(0, MAX_IMPORT_TASKS)
        .map((t) => ({
          title: str(t?.title, 80),
          description: str(t?.description, 1000),
          priority: (PRIORITY_SET.has(t?.priority) ? t.priority : 'medium') as Priority,
          column: titleToId.get(str(t?.column, 30)) ?? columns[0].id,
          dueDate: cleanDate(t?.dueDate),
          labels: [...new Set(asArray(t?.labels).filter((l) => LABELS.includes(l)))],
          checklist: asArray(t?.checklist)
            .slice(0, 30)
            .map((i, n) => ({ id: `i${n}`, text: str(i?.text, 120), done: Boolean(i?.done) }))
            .filter((i) => i.text),
        }))
        .filter((t) => t.title);
      return { name: str(b?.name, 40) || 'Imported board', columns, tasks };
    });
}

// ---------- Trello (Board menu → Print, export and share → Export as JSON) ----------
const TRELLO_LABEL: Record<string, string> = { red: 'urgent', orange: 'urgent', purple: 'design', blue: 'feature', green: 'feature', yellow: 'bug' };

function fromTrello(data: any): ImportedBoard[] {
  const lists = asArray(data.lists).filter((l) => !l?.closed);
  const columns = cleanColumns(lists.map((l) => ({ title: str(l?.name, 30) })));
  const listToColumn = new Map(lists.slice(0, MAX_COLUMNS).map((l, i) => [String(l.id), columns[i]?.id]));
  const checklists = new Map(asArray(data.checklists).map((c) => [String(c?.id), asArray(c?.checkItems)]));

  const tasks = asArray(data.cards)
    .filter((c) => !c?.closed)
    .slice(0, MAX_IMPORT_TASKS)
    .map((c) => {
      const labelNames = asArray(c?.labels).map((l) => str(l?.name, 30).toLowerCase());
      const labels = [
        ...new Set([
          ...labelNames.filter((n) => LABELS.includes(n)),
          ...asArray(c?.labels).map((l) => TRELLO_LABEL[l?.color]).filter(Boolean),
        ]),
      ];
      const items = asArray(c?.idChecklists).flatMap((id) => checklists.get(String(id)) ?? []);
      return {
        title: str(c?.name, 80),
        description: str(c?.desc, 1000),
        priority: (labels.includes('urgent') ? 'high' : 'medium') as Priority,
        column: listToColumn.get(String(c?.idList)) ?? columns[0].id,
        dueDate: cleanDate(c?.due),
        labels,
        checklist: items.slice(0, 30).map((i, n) => ({ id: `i${n}`, text: str(i?.name, 120), done: i?.state === 'complete' })).filter((i) => i.text),
      };
    })
    .filter((t) => t.title);

  return [{ name: str(data.name, 40) || 'Trello board', columns, tasks }];
}

export type ImportFormat = 'flowboard' | 'trello';

export function parseImport(data: unknown): { format: ImportFormat; boards: ImportedBoard[] } | { error: string } {
  if (!data || typeof data !== 'object') return { error: 'That file is not valid JSON.' };
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.boards)) return { format: 'flowboard', boards: fromFlowboard(d) };
  if (Array.isArray(d.lists) && Array.isArray(d.cards)) return { format: 'trello', boards: fromTrello(d) };
  return { error: 'Unknown file. Use a Flowboard backup or a Trello JSON export.' };
}
