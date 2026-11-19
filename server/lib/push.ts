import webpush from 'web-push';
import type { ObjectId } from 'mongodb';
import { pushSubscriptions, settings } from '../db.ts';

// 🔔 Push notifications: website moodi irundhaalum phone / computer la "Anu assigned you a task" nu alert
// VAPID keys = namma server oda adaiyaalam. .env la VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY illana,
// mudhal thadavai create panni database la (settings 'vapid') vechukkum: restart aanaalum maaraadhu

// Browser kudukkura subscription endpoint: theriyum push services ku mattum (vera URL ku namma server anuppa koodaadhu: SSRF)
const PUSH_HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.apple\.com$/];
export function isPushEndpoint(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length > 800) return false;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}

let keys: { publicKey: string; privateKey: string } | null = null;
export async function vapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  if (keys) return keys;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    return keys;
  }
  const saved = await settings.findOne({ _id: 'vapid' });
  if (saved?.publicKey && saved.privateKey) {
    keys = { publicKey: saved.publicKey, privateKey: saved.privateKey };
    return keys;
  }
  const fresh = webpush.generateVAPIDKeys();
  // $setOnInsert: rendu request ore neraththula vandhaalum ore key thaan save aagum
  await settings.updateOne({ _id: 'vapid' }, { $setOnInsert: { publicKey: fresh.publicKey, privateKey: fresh.privateKey } }, { upsert: true });
  const stored = await settings.findOne({ _id: 'vapid' });
  keys = { publicKey: stored!.publicKey!, privateKey: stored!.privateKey! };
  return keys;
}

export interface PushMessage {
  title: string;
  body: string;
  url?: string; // click pannaa thirakka vendiya page
}

// 🧪 Tests la fake sender (unmaiyaana push service ku pogaama)
type Sender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<unknown>;
let sender: Sender | null = null;
export function setPushSender(fn: Sender | null): void {
  sender = fn;
}

// 📣 Oruthar oda ellaa devices kkum anuppu. Device "unsubscribe" aagirundhaa (404 / 410) adhai thookku
export async function sendPush(userId: ObjectId, message: PushMessage): Promise<number> {
  const subs = await pushSubscriptions.find({ userId }).toArray();
  if (!subs.length) return 0;
  const { publicKey, privateKey } = await vapidKeys();
  const payload = JSON.stringify({ ...message, body: message.body.slice(0, 200) });
  let sent = 0;
  await Promise.all(
    subs.map(async (sub) => {
      const target = { endpoint: sub.endpoint, keys: sub.keys };
      try {
        if (sender) await sender(target, payload);
        else
          await webpush.sendNotification(target, payload, {
            TTL: 60 * 60 * 24,
            vapidDetails: { subject: process.env.APP_URL?.startsWith('https://') ? process.env.APP_URL : 'mailto:admin@flowboard.local', publicKey, privateKey },
          });
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await pushSubscriptions.deleteOne({ _id: sub._id }); // device la permission eduththutaanga
        else console.log('⚠️ Push anuppa mudiyala:', status ?? (err as Error).message);
      }
    })
  );
  return sent;
}
