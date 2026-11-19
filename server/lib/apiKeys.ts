import crypto from 'node:crypto';
import type { Request } from 'express';
import type { ApiKey } from '../types.ts';

// 🔑 Personal API keys: "Authorization: Bearer fb_..." header la anuppi, script / vera app la irunthu Flowboard use pannalaam
// Full key ah database la vaikka maattom: sha256 hash mattum. Key leak aanaalum database la irunthu thirumba edukka mudiyaadhu.

export const MAX_API_KEYS = 10;

// 🎲 Pudhu key: "fb_" + 32 random letters. User ku ore oru thadavai mattum kaattuvom
export function generateApiKey(): { key: string; keyHash: string; prefix: string } {
  const key = `fb_${crypto.randomBytes(24).toString('base64url')}`;
  return { key, keyHash: hashApiKey(key), prefix: key.slice(0, 11) };
}

// Random key ku scrypt theva illa (guess panna mudiyaadha neelam): sha256 podhum, vegamaa um irukkum
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// "Authorization: Bearer xxx" la irunthu xxx
export function bearerToken(req: Pick<Request, 'get'>): string | null {
  const header = req.get('authorization');
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

// 🚫 API key la seiya koodaadhavai (/api kku apram ulla path):
// login / password / account delete, keys & webhooks manage pannuradhu, billing (panam). Key thirudu poanaalum account ah eduththukka mudiyaadhu
const KEY_BLOCKED = /^\/(auth|account|keys|webhooks|admin|billing|push)(\/|$)|^\/boards\/[^/]+\/webhooks(\/|$)/;
export function apiKeyAllowed(path: string): boolean {
  return !KEY_BLOCKED.test(path);
}

// Website ku anuppura format (hash anuppa maattom)
export function toApiKey(doc: ApiKey) {
  return { id: String(doc._id), name: doc.name, prefix: doc.prefix, createdAt: doc.createdAt, lastUsedAt: doc.lastUsedAt };
}
