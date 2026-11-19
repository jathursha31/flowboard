import crypto from 'node:crypto';
import type { Request } from 'express';
import { analytics } from '../db.ts';
import { dayKey, lastDays } from './helpers.ts';

// 📊 Website analytics: ethanai per vandhaanga, endha page, enga irunthu, enna click pannaanga
// 🔒 Privacy: cookies illa, IP save pannave maattom. Visitor = hash(innaikku oda random salt + IP + browser):
// naalaikku salt maarum, adhanaala oruththarai naal kanakkula follow panna mudiyaadhu (Plausible maari)

// Website anuppa mudiyura event peyargal mattum (yaarum random peyar pottu database ah nirappa koodaadhu)
export const TRACK_EVENTS = ['cta_click', 'signup', 'login', 'task_created', 'chat_sent', 'ai_used', 'install_app', 'pricing_click'] as const;

const salts = new Map<string, string>(); // day → salt (memory la mattum)
function saltFor(day: string): string {
  if (!salts.has(day)) {
    salts.clear(); // pazhaya naal salt ah marandhudu
    salts.set(day, crypto.randomBytes(16).toString('hex'));
  }
  return salts.get(day)!;
}

export function visitorId(req: Request, day: string): string {
  return crypto
    .createHash('sha256')
    .update(`${saltFor(day)}|${req.ip}|${req.get('user-agent') ?? ''}`)
    .digest('hex')
    .slice(0, 16);
}

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|curl|wget|python|node-fetch|axios/i;
export function shouldSkip(req: Request): boolean {
  const ua = req.get('user-agent') ?? '';
  // 🙅 "Track pannaadhe" nu browser sonnaa (Do Not Track / Global Privacy Control) mariyaadhai kudu
  return !ua || BOT.test(ua) || req.get('dnt') === '1' || req.get('sec-gpc') === '1';
}

export const deviceOf = (ua: string): 'mobile' | 'tablet' | 'desktop' =>
  /ipad|tablet/i.test(ua) ? 'tablet' : /mobi|android|iphone/i.test(ua) ? 'mobile' : 'desktop';

// "/app?board=123#x" → "/app" (query la private ids irukkalaam)
export function cleanPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return null;
  const path = raw.split(/[?#]/)[0].slice(0, 120);
  return path.replace(/\/[0-9a-f]{24}(?=\/|$)/gi, '/:id'); // MongoDB ids → :id
}

// "https://www.google.com/search?q=.." → "google.com". Namma site na null
export function cleanReferrer(raw: unknown, ownHost: string | undefined): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const host = new URL(raw).hostname.replace(/^www\./, '').slice(0, 80);
    return host && host !== ownHost?.replace(/^www\./, '').split(':')[0] ? host : null;
  } catch {
    return null;
  }
}

type Count = { key: string; count: number };
const top = async (match: Record<string, unknown>, field: string, limit = 8): Promise<Count[]> =>
  (await analytics.aggregate([{ $match: { ...match, [field]: { $ne: null } } }, { $group: { _id: `$${field}`, count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: limit }]).toArray()).map(
    (g) => ({ key: String(g._id), count: g.count })
  );

// 📈 Admin page ku: kadaisi n naal summary
export async function analyticsSummary(days = 30) {
  const range = lastDays(days);
  const since = range[0];
  const views = { type: 'pageview', createdAt: { $gte: since } };

  const daily = await analytics
    .aggregate([
      { $match: views },
      { $group: { _id: '$day', pageviews: { $sum: 1 }, visitors: { $addToSet: '$visitor' } } },
      { $project: { pageviews: 1, visitors: { $size: '$visitors' } } },
    ])
    .toArray();
  const byDay = new Map(daily.map((d) => [String(d._id), { pageviews: d.pageviews as number, visitors: d.visitors as number }]));
  const series = range.map((d) => ({ day: dayKey(d), ...(byDay.get(dayKey(d)) ?? { pageviews: 0, visitors: 0 }) }));
  const today = series.at(-1)!;
  const yesterday = series.at(-2) ?? { pageviews: 0, visitors: 0 };

  return {
    series,
    today,
    yesterday,
    totalPageviews: series.reduce((s, d) => s + d.pageviews, 0),
    totalVisits: series.reduce((s, d) => s + d.visitors, 0), // ovvoru naalum thani visitor (naal maarinaa hash maarum)
    pages: await top(views, 'path'),
    referrers: await top(views, 'ref'),
    devices: await top(views, 'device', 3),
    events: await top({ type: 'event', createdAt: { $gte: since } }, 'name'),
  };
}
