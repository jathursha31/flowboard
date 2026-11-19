import { api } from './api.ts';
import type { Method } from './api.ts';

// 📴 Offline mode: internet illaadhapodhu maatrangalai "outbox" la vechu, net vandhadhum varisaiyaa anuppu
// localStorage la save: browser moodi thirandhaalum maatrangal pogaadhu

export interface OutboxOp {
  url: string;
  method: Method;
  body?: unknown;
  tempId?: string; // offline la create panna task oda temporary id
  queuedAt?: number;
}

export interface FlushResult {
  synced: number;
  dropped: number;
  idMap: Record<string, string>;
}

const OUTBOX_KEY = 'flowboard-outbox';
const listeners = new Set<(count: number) => void>();

function read<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / private mode */
  }
}

// 🔌 fetch() network la fail aanaa TypeError varum (server error illa)
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false);
}

export function newTempId(): string {
  return `tmp-${Math.random().toString(36).slice(2, 10)}`;
}
export const isTempId = (id: unknown): boolean => typeof id === 'string' && id.startsWith('tmp-');

export function outbox(): OutboxOp[] {
  return read<OutboxOp[]>(OUTBOX_KEY, []);
}
function setOutbox(list: OutboxOp[]): void {
  write(OUTBOX_KEY, list);
  for (const fn of listeners) fn(list.length);
}

// UI ku: ethanai maatrangal kaathirukku nu therinjukka
export function onOutboxChange(fn: (count: number) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ➕ Oru maatram outbox la serkka
export function queue(op: OutboxOp): void {
  setOutbox([...outbox(), { ...op, queuedAt: Date.now() }]);
}

// 🌐 Try online; net illana outbox la podu. Returns { data } (online) illa { queued: true }
export async function sendOrQueue<T = any>(
  url: string,
  method: Method,
  body?: unknown,
  extra: Pick<OutboxOp, 'tempId'> = {}
): Promise<{ data?: T; queued?: true }> {
  try {
    return { data: await api<T>(url, method, body) };
  } catch (err) {
    if (!isNetworkError(err)) throw err; // server "thappu" sonnaa adhu unmaiyaana error
    queue({ url, method, body, ...extra });
    return { queued: true };
  }
}

// tmp-xxx → unmaiyaana id (URL layum body layum)
function remap<T>(value: T, idMap: Record<string, string>): T {
  let text = JSON.stringify(value ?? null);
  for (const [temp, real] of Object.entries(idMap)) text = text.split(temp).join(real);
  return JSON.parse(text) as T;
}

// 🔄 Net vandhadhum: varisaiyaa anuppu. Network thirumba poanaa nirutthi, meedhi apram
// 🔒 Ore neraththula oru sync mattum ("online" event rendu thadavai vandhaalum ore maatram rendu thadavai pogaadhu)
let flushing: Promise<FlushResult> | null = null;
export const isFlushing = (): boolean => flushing !== null; // 🔒 ippo sync nadakkudhaa
export function flushOutbox(): Promise<FlushResult> {
  flushing ??= doFlush().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function doFlush(): Promise<FlushResult> {
  const ops = outbox();
  if (!ops.length) return { synced: 0, dropped: 0, idMap: {} };
  const idMap: Record<string, string> = {};
  let synced = 0;
  let dropped = 0;
  let index = 0;
  for (; index < ops.length; index++) {
    const op = ops[index];
    const url = remap(op.url, idMap);
    const body = remap(op.body, idMap);
    try {
      const data = await api<{ id?: string }>(url, op.method, body ?? undefined);
      if (op.tempId && data?.id) idMap[op.tempId] = data.id; // offline create → server kuduththa id
      synced++;
    } catch (err) {
      if (isNetworkError(err)) break; // innum net illa: meedhi apram
      dropped++; // server ethukkalaa (task already deleted maari): vittudu
    }
  }
  setOutbox(remap(ops.slice(index), idMap)); // anuppaadhavai mattum, pudhu ids oda
  return { synced, dropped, idMap };
}

// 💾 Kadaisiya paatha data: offline la board thirakka
export function cacheSet(key: string, value: unknown): void {
  write(`flowboard-cache-${key}`, value);
}
export function cacheGet<T = any>(key: string): T | null {
  return read<T | null>(`flowboard-cache-${key}`, null);
}
