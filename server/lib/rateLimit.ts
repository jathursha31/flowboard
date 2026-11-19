import type { NextFunction, Request, RequestHandler, Response } from 'express';

interface HitEntry {
  count: number; // ethanai thadavai
  resetAt: number; // eppo reset (ms)
}

interface RateLimitOptions {
  windowMs: number; // evlo neraththukku
  max: number; // max ethanai try
  message: string; // limit thaandinaa solra message
  keyOf?: (req: Request) => string; // yaarai count pannanum (default: IP address)
}

// 🧪 Tests la limits ah on / off panna (normal ah eppovum on)
let limitsEnabled = true;
const allHits: Map<string, HitEntry>[] = []; // ellaa limiters oda hit lists (reset panna)
export function setRateLimitsEnabled(on: boolean): void {
  limitsEnabled = on;
}
export function resetRateLimits(): void {
  for (const hits of allHits) hits.clear();
}

// 🚦 Rate limiter: oru IP address ku, oru neraththukku ethanai try nu limit
// (Brute force / spam thadukka. ATM la 3 thadavai thappaana PIN pottaa block aagura maari!)
export function rateLimit({ windowMs, max, message, keyOf }: RateLimitOptions): RequestHandler {
  const hits = new Map<string, HitEntry>(); // 📒 IP → { count: ethanai thadavai, resetAt: eppo reset }
  allHits.push(hits);

  // 🧹 Time mudinja entries ah adikkadi azhi (memory nirambaama irukka)
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) if (now > entry.resetAt) hits.delete(ip);
  }, windowMs).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    if (!limitsEnabled) return next();
    const now = Date.now();
    const ip = keyOf ? keyOf(req) : (req.ip ?? 'unknown');
    let entry = hits.get(ip);

    // ⏰ Mudhal thadavai, illa neram mudinjiduchu → pudhu count
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(ip, entry);
    }

    entry.count++;

    // 🚦 Limit thaandiduchaa? → 429 "Too Many Requests"
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      if (req.originalUrl.startsWith('/api/')) {
        return res.status(429).json({ error: message });
      }
      return res.status(429).send(`<p>🚦 ${message}</p><p><a href="/login">← Back</a></p>`);
    }

    next(); // ✅ Limit kulla irukku, po
  };
}

// 🚦 Limits
export const adminLoginLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: 'Too many login attempts. Try again in 15 minutes.' });
export const userAuthLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many attempts. Please try again in 15 minutes.' });
export const contactLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 5, message: 'Too many messages. Please try again in a few minutes.' });
export const reviewLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: 'Too many review updates. Please try again later.' }); // 🆕 ⭐
export const aiLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: 'AI limit reached (10 per hour). Please try again later.' }); // 🆕 🤖 AI ku panam aagum!
export const proAiLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 100, message: 'AI limit reached (100 per hour). Please try again later.', keyOf: (req) => String(req.user?._id) }); // 🆕 💎 Pro users
export const apiKeyLimit = rateLimit({ windowMs: 60 * 1000, max: 120, message: 'API key rate limit: 120 requests per minute.', keyOf: (req) => String(req.apiKey?._id) }); // 🆕 🔑 ovvoru key kkum thani
export const chatLimit = rateLimit({ windowMs: 60 * 1000, max: 30, message: "You are sending messages too fast. Wait a moment.", keyOf: (req) => String(req.user?._id ?? req.ip) }); // 🆕 💬
export const trackLimit = rateLimit({ windowMs: 60 * 1000, max: 120, message: 'Too many events.' }); // 🆕 📊
export const calendarLimit = rateLimit({ windowMs: 60 * 1000, max: 30, message: 'Too many calendar requests.' }); // 🆕 📅
export const webhookTestLimit = rateLimit({ windowMs: 60 * 1000, max: 5, message: 'Too many test pings. Wait a minute.' }); // 🆕 🪝
