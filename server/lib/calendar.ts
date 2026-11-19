import crypto from 'node:crypto';
import type { ObjectId } from 'mongodb';
import { boards, tasks } from '../db.ts';

// 📅 Calendar feed (.ics): Google Calendar / iPhone / Outlook la "URL la irunthu subscribe" pannaa due dates kaattum
// Ovvoru user kkum thani ragasiya link (token). Link leak aanaa Account page la "new link" pottaa pazhasu sethudum

export const newCalendarToken = () => crypto.randomBytes(24).toString('base64url');

// RFC 5545: \ ; , newline ah escape pannanum
const esc = (text: string) => text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// 75 bytes ku mela line na "fold" pannanum (adutha line space la aarambikkum)
function fold(line: string): string {
  const parts: string[] = [];
  let current = '';
  for (const ch of line) {
    if (Buffer.byteLength(current + ch) > 74) {
      parts.push(current);
      current = ' ';
    }
    current += ch;
  }
  parts.push(current);
  return parts.join('\r\n');
}

const ymd = (date: string) => date.replaceAll('-', '');
const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export async function buildCalendar(uid: ObjectId, appUrl: string): Promise<string> {
  const myBoards = await boards.find({ $or: [{ userId: uid }, { members: uid }] }, { projection: { name: 1, columns: 1 } }).toArray();
  const byId = new Map(myBoards.map((b) => [String(b._id), b]));
  const due = await tasks
    .find({ boardId: { $in: myBoards.map((b) => b._id) }, dueDate: { $type: 'string' } }, { projection: { title: 1, dueDate: 1, boardId: 1, column: 1, priority: 1 } })
    .limit(500)
    .toArray();

  const now = stamp(new Date());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Flowboard//Tasks//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Flowboard tasks'];
  for (const t of due) {
    const board = byId.get(String(t.boardId));
    if (!board || !/^\d{4}-\d{2}-\d{2}$/.test(t.dueDate!)) continue;
    const done = t.column === board.columns.at(-1)?.id;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${t._id}@flowboard`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${ymd(t.dueDate!)}`,
      `DTEND;VALUE=DATE:${ymd(nextDay(t.dueDate!))}`, // muzhu naal event
      `SUMMARY:${esc(`${done ? '✅ ' : t.priority === 'high' ? '🔥 ' : ''}${t.title}`)}`,
      `DESCRIPTION:${esc(`Board: ${board.name}\n${appUrl}/app?board=${board._id}&task=${t._id}`)}`,
      `URL:${appUrl}/app?board=${board._id}&task=${t._id}`,
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
