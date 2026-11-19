import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { ObjectId } from 'mongodb';
import type { User } from '../types.ts';
import { promisify } from 'node:util';
import { AVATAR_COLORS } from './constants.ts';
import { getCookie } from './helpers.ts';
import { apiKeys, auditLog, sessions, userSessions, users } from '../db.ts';
import { apiKeyAllowed, bearerToken, hashApiKey } from './apiKeys.ts';
import { apiKeyLimit } from './rateLimit.ts';

// 🔐 Passwords, login tickets (sessions), "yaar login" middleware, admin gate, audit log

// 🔒 Password hashing (scrypt: Node la ulla irukku, install venaam)
export const scrypt = promisify(crypto.scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>;

// Password ah scramble panni save panra format: "salt:hash"
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex'); // 🧂 ovvoru user kkum thani random uppu
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

// Type panna password, save aana hash oda match aagudha?
export async function checkPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false; // 🔵 Google la mattum login pannura account (password illa)
  const [salt, hash] = stored.split(':');
  const test = await scrypt(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), test);
}

// Website ku anuppa safe ana user info (passwordHash KANDIPPAA anuppakoodaadhu!)
export function publicUser(user: Pick<User, 'name' | 'email' | 'avatarColor' | 'passwordHash' | 'plan'>) {
  return {
    name: user.name,
    email: user.email,
    avatarColor: user.avatarColor ?? AVATAR_COLORS[0], // 🆕 🎨
    hasPassword: Boolean(user.passwordHash), // 🆕 🔵 Google account la password illaama irukkalaam
    plan: user.plan === 'pro' ? 'pro' : 'free', // 🆕 💎
  };
}

// 🎟️ User ku ticket kuduthu cookie la vai
export async function startUserSession(res: Response, userId: ObjectId): Promise<void> {
  const token = crypto.randomUUID();
  await userSessions.insertOne({ token, userId, createdAt: new Date() });
  res.cookie('user_token', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: res.req.secure, // 🔒 HTTPS la (deploy) cookie HTTPS la mattum pogum
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 naal
  });
}

// 👤 Ovvoru /api request kkum: login aana user yaar nu kandupidi
export async function loadUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  req.user = null;
  req.apiKey = null;
  const bearer = bearerToken(req);
  if (bearer) return loadApiKeyUser(req, res, next, bearer); // 🔑 script / vera app
  const token = getCookie(req, 'user_token');
  if (token) {
    const session = await userSessions.findOne({ token });
    if (session) {
      const user = await users.findOne({ _id: session.userId });
      req.user = user && !user.disabled ? user : null; // 🆕 🚫 disable aana user = login illa
    }
  }
  next();
}

// 🆕 🔑 "Authorization: Bearer fb_..." → andha key oda owner ah user aakku
async function loadApiKeyUser(req: Request, res: Response, next: NextFunction, key: string): Promise<void> {
  const found = await apiKeys.findOne({ keyHash: hashApiKey(key) });
  const user = found && (await users.findOne({ _id: found.userId }));
  if (!found || !user || user.disabled) {
    res.status(401).json({ error: 'Invalid API key.' });
    return;
  }
  if (!apiKeyAllowed(req.path)) {
    res.status(403).json({ error: "API keys can't be used for this. Log in on the website instead." });
    return;
  }
  req.user = user;
  req.apiKey = found;
  // ⏱️ "Last used" ah nimishaththukku oru thadavai mattum ezhudhu (ovvoru request kkum database write vendaam)
  if (!found.lastUsedAt || Date.now() - found.lastUsedAt.getTime() > 60_000) {
    apiKeys.updateOne({ _id: found._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {});
  }
  apiKeyLimit(req, res, next); // 🚦 ovvoru key kkum 120 / nimisham
}

// 🆕 🔐 User login aagirundhaa mattum (boards create / columns maathu / AI)
export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Please log in to do that.' });
  next();
}

// 👮 Admin gate kaaran
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = getCookie(req, 'admin_token');
  if (token && (await sessions.findOne({ token }))) {
    return next();
  }
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ error: 'Login venum!' });
  }
  res.redirect('/login');
}

// 🆕 📜 Admin action ah audit log la ezhudhu (fail aanaalum main vela nikkakoodaadhu)
export async function audit(req: Request, action: string, detail: unknown = ''): Promise<void> {
  try {
    await auditLog.insertOne({ action, detail: String(detail).slice(0, 200), ip: req.ip, createdAt: new Date() });
  } catch (err) {
    console.log('⚠️ Audit log ezhudha mudiyala:', (err as Error).message);
  }
}
