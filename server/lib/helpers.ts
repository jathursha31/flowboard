import { ObjectId } from 'mongodb';
import type { Request } from 'express';

// 🧰 Chinna utility functions (database theva illa, test panna easy)

// 🆔 URL la vandha id ah MongoDB ObjectId aa maathu (thappaa irundhaa null)
export function toObjectId(id: unknown): ObjectId | null {
  if (id instanceof ObjectId) return id;
  return typeof id === 'string' && ObjectId.isValid(id) ? new ObjectId(id) : null;
}

// 📝 Ithu ezhuthu (string) thaanaa nu check
export function isText(value: unknown): value is string {
  return typeof value === 'string';
}

// 🧼 HTML la aabaththaana letters ah safe aakku (XSS la irunthu kaappaathu)
export function escapeHtml(text: unknown): string {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// 🍪 Browser anuppuna cookie la irunthu oru value edu
export function getCookie(req: Pick<Request, 'headers'>, name: string): string | null {
  const cookies = req.headers.cookie || '';
  for (const part of cookies.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

// 🔍 Regex special letters ( . * + ? ( ) [ ] ...) ah saadharana ezhuthaa maathu
// (ReDoS attack thadukka: illana "(a+)+$" maari search server ah hang pannidum!)
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 🆕 📥 CSV la oru kattam (cell) safe ah ezhudha
// " ah "" aakkum, ellaaththaiyum "..." kulla podum.
// 🛡️ = + - @ la aarambichaa munnaadi ' podum: Excel athai formula ah run pannaama irukka (CSV injection)
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

// 🆕 📅 Date ah "2026-10-22" maari (ungal computer time la) maathu: chart ku naal vaariyaa pirikka
export function dayKey(date: Date | number | string): string {
  return new Date(date).toLocaleDateString('en-CA');
}

// 🆕 📅 Kadaisi n naal (innaikku um serthu), pazhasu mudhalla
export function lastDays(n: number): Date[] {
  const days: Date[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days;
}

// 🆕 🔙 Admin page ku thirumba po (search panniyirundhaa athe search la)
// 🆕 📧 "Email app la open pannu" link (subject + reply text ready ah)
export function mailtoLink(email: string, text: string): string {
  const to = encodeURIComponent(email).replace(/%40/g, '@');
  return `mailto:${to}?subject=${encodeURIComponent('Re: your message to Flowboard')}&body=${encodeURIComponent(text)}`;
}

export function adminUrl(q: unknown, hash = ''): string {
  return `/admin${isText(q) && q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}${hash}`;
}

// 🟦 Database la irukka vendiya document (illana bug): TypeScript ku 'null illa' nu sollum, illana error
export function must<T>(value: T | null | undefined, what = 'Document'): T {
  if (value === null || value === undefined) throw new Error(`${what} not found`);
  return value;
}
