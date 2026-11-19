import crypto from 'node:crypto';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import type { LookupFunction } from 'node:net';
import type { ObjectId } from 'mongodb';
import { webhooks } from '../db.ts';
import { cached, invalidate } from './cache.ts';
import type { Webhook, WebhookDelivery } from '../types.ts';

// 🪝 Webhooks: board la task maarinaa, owner kudutha URL ku POST (Slack bot, Zapier, ungal sondha server...)
// Ovvoru message kkum HMAC signature: receiver "idhu unmaiyaave Flowboard anuppunadhu" nu check pannalaam

export const WEBHOOK_EVENTS = [
  'task.created',
  'task.edited',
  'task.moved',
  'task.completed',
  'task.assigned',
  'task.commented',
  'task.attached',
  'task.deleted',
] as const;
export const MAX_WEBHOOKS_PER_BOARD = 5;
const MAX_FAILURES = 10; // thodarndhu 10 fail → auto off (sethu poana URL ku adikkadi anuppa vendaam)
const TIMEOUT_MS = 5000;

// 🧪 Dev / tests la mattum: http:// um localhost um allow (WEBHOOK_ALLOW_PRIVATE=1). Production la KOODAADHU
const allowPrivate = () => process.env.WEBHOOK_ALLOW_PRIVATE === '1';

// 🛡️ SSRF thaduppu: webhook URL vechu namma server ah ulla irukkura (private) machines ku anuppa vaikka koodaadhu
// (127.0.0.1, 10.x, 192.168.x, cloud metadata 169.254.169.254...)
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || // carrier NAT
      (a === 169 && b === 254) || // link-local + cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return net.isIPv4(v6.slice(7)) ? isPrivateIp(v6.slice(7)) : true; // IPv4-in-IPv6
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

// URL sariyaa? Thappu na error message, sari na null
export function checkWebhookUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 500) return 'Enter a valid URL.';
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'Enter a valid URL.';
  }
  if (url.protocol !== 'https:' && !(allowPrivate() && url.protocol === 'http:')) return 'Webhook URLs must start with https://';
  if (url.username || url.password) return 'Remove the username and password from the URL.';
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!allowPrivate() && (host === 'localhost' || host.endsWith('.localhost') || (net.isIP(host) && isPrivateIp(host)))) {
    return 'Webhook URLs must be on the public internet.';
  }
  return null;
}

// 🔍 Connect pannura neraththula DNS check: "public.example.com" → 127.0.0.1 nu thirumbinaalum (DNS rebinding) block
const safeLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '', 4);
    if (!allowPrivate() && addresses.some((a) => isPrivateIp(a.address))) {
      return callback(new Error('Blocked: that address is on a private network.'), '', 4);
    }
    if (options.all) return (callback as any)(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
};

// ✍️ Signature: HMAC-SHA256(secret, "<timestamp>.<body>")
export function signPayload(secret: string, timestamp: number, body: string): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export function newWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString('base64url')}`;
}

// 📮 Oru POST anuppu (redirect follow panna maattom: adhuvum SSRF vazhi)
function post(rawUrl: string, body: string, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = new URL(rawUrl);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      url,
      { method: 'POST', headers: { ...headers, 'content-length': String(Buffer.byteLength(body)) }, lookup: safeLookup, timeout: TIMEOUT_MS },
      (res) => {
        res.resume(); // badhil body theva illa
        resolve(res.statusCode ?? 0);
      }
    );
    req.on('timeout', () => req.destroy(new Error(`No reply within ${TIMEOUT_MS / 1000}s`)));
    req.on('error', reject);
    req.end(body);
  });
}

// 💬 URL paarththu: Slack incoming webhook / Discord webhook / normal JSON
export type WebhookFormat = 'slack' | 'discord' | 'json';
export function formatFor(raw: string): WebhookFormat {
  try {
    const url = new URL(raw);
    if (url.hostname === 'hooks.slack.com') return 'slack';
    if (/^(ptb\.|canary\.)?discord(app)?\.com$/.test(url.hostname) && url.pathname.startsWith('/api/webhooks/')) return 'discord';
  } catch {
    /* thappaana URL: json */
  }
  return 'json';
}

const VERBS: Record<string, string> = {
  'task.created': '🆕 created',
  'task.edited': '✏️ edited',
  'task.moved': '➡️ moved',
  'task.completed': '✅ completed',
  'task.assigned': '👤 assigned',
  'task.commented': '💬 commented on',
  'task.attached': '📎 attached a file to',
  'task.deleted': '🗑️ deleted',
};

// "✅ *Anu* completed "Logo" → Done · My board" (b = bold mark: Slack '*', Discord '**')
export function chatText(event: string, data: Record<string, any>, b: string): string {
  if (event === 'ping') return `👋 ${b}Flowboard${b} is connected. Task updates from this board will appear here.`;
  const clean = (v: unknown) => String(v ?? '').replace(/[*_~`<>@|]/g, '').slice(0, 120); // Slack / Discord formatting / mention tricks thadu
  const arrow = ['task.moved', 'task.completed', 'task.assigned'].includes(event) && data.detail ? ` → ${clean(data.detail)}` : '';
  return `${VERBS[event] ? '' : '🔔 '}${b}${clean(data.actor?.name)}${b} ${VERBS[event] ?? clean(event)} "${clean(data.task?.title)}"${arrow} · ${clean(data.board?.name)}`;
}

// 🚀 Anuppi, result ah database la note pannu
export async function deliver(hook: Webhook, event: string, data: Record<string, unknown>): Promise<WebhookDelivery> {
  const deliveryId = crypto.randomUUID();
  const full = { id: deliveryId, event, createdAt: new Date().toISOString(), ...data };
  // 💬 Slack / Discord ku avanga format la (padikkura message), mattha ellaarukkum full JSON
  const format = formatFor(hook.url);
  const body = JSON.stringify(format === 'slack' ? { text: chatText(event, data, '*') } : format === 'discord' ? { content: chatText(event, data, '**') } : full);
  const timestamp = Math.floor(Date.now() / 1000);
  const started = Date.now();
  let delivery: WebhookDelivery;
  try {
    const problem = checkWebhookUrl(hook.url); // IP address URL ku DNS lookup nadakkaadhu: inga thirumba check
    if (problem) throw new Error(problem);
    const status = await post(hook.url, body, {
      'content-type': 'application/json',
      'user-agent': 'Flowboard-Webhooks/1.0',
      'x-flowboard-event': event,
      'x-flowboard-delivery': deliveryId,
      'x-flowboard-signature': `t=${timestamp},v1=${signPayload(hook.secret, timestamp, body)}`,
    });
    delivery = { at: new Date(), event, status, ok: status >= 200 && status < 300, ms: Date.now() - started };
  } catch (err) {
    delivery = { at: new Date(), event, status: null, ok: false, error: (err as Error).message.slice(0, 120), ms: Date.now() - started };
  }

  const push = { deliveries: { $each: [delivery], $slice: -10 } };
  if (delivery.ok) {
    await webhooks.updateOne({ _id: hook._id }, { $push: push, $set: { failures: 0 } });
  } else {
    const after = await webhooks.findOneAndUpdate({ _id: hook._id }, { $push: push, $inc: { failures: 1 } }, { returnDocument: 'after' });
    if (after && after.failures >= MAX_FAILURES && after.active) {
      await webhooks.updateOne({ _id: hook._id }, { $set: { active: false } });
      invalidate(`webhooks:${hook.boardId}`);
      console.log(`🪝 Webhook ${hook._id} turned off after ${MAX_FAILURES} failures`);
    }
  }
  return delivery;
}

// 📣 Board la event nadandhudhu: subscribe panna ellaa webhooks kkum (background la, user ah kaathirukka vaikkaama)
const inFlight = new Set<Promise<void>>();
export function fireWebhooks(boardId: ObjectId, event: string, data: Record<string, unknown>): void {
  const job = (async () => {
    // ⚡ Ovvoru maatraththukkum database la kekkaama 30s cache (create / delete / toggle pannaa azhiyum)
    const hooks = await cached(`webhooks:${boardId}`, 30_000, () => webhooks.find({ boardId, active: true }).toArray());
    const wanted = hooks.filter((h) => h.events.includes('*') || h.events.includes(event));
    await Promise.all(wanted.map((h) => deliver(h, event, data)));
  })().catch((err) => console.log('⚠️ Webhook anuppa mudiyala:', (err as Error).message));
  inFlight.add(job);
  job.finally(() => inFlight.delete(job));
}

// 🧪 Tests ku: anuppikittu irukkura ellaam mudiyura varai kaathiru
export async function waitForWebhooks(): Promise<void> {
  while (inFlight.size) await Promise.allSettled([...inFlight]);
}

// Website ku (secret anuppa maattom: create pannumbodhu mattum ore thadavai)
export function toWebhook(doc: Webhook) {
  return {
    id: String(doc._id),
    boardId: String(doc.boardId),
    url: doc.url,
    format: formatFor(doc.url), // 💬 slack / discord / json
    events: doc.events,
    active: doc.active,
    failures: doc.failures,
    deliveries: [...(doc.deliveries ?? [])].reverse(), // pudhusu mudhalla
    createdAt: doc.createdAt,
  };
}
