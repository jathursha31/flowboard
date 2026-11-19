// ⚡ Chinna memory cache: ellaarum paakkura public data (reviews, updates, banner) ah
// ovvoru request kkum database la kekkaama, konja neram nyaabagam vechukko.
// Admin maathinaa udane azhi (invalidate), adhanaala pazhaya data kaattaadhu.

interface Entry {
  value: unknown;
  expiresAt: number;
  pending?: Promise<unknown>;
}

const store = new Map<string, Entry>();
let hits = 0;
let misses = 0;

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const entry = store.get(key);
  if (entry && entry.expiresAt > now) {
    hits++;
    return entry.value as T;
  }
  if (entry?.pending) return entry.pending as Promise<T>; // ore neraththula 100 per vandhaalum DB ku oru thadavai thaan
  misses++;
  const pending = load().then(
    (value) => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    },
    (err) => {
      store.delete(key);
      throw err;
    }
  );
  store.set(key, { value: entry?.value, expiresAt: 0, pending });
  return pending;
}

// "public:" nu aarambikkura ellaam azhi
export function invalidate(prefix: string): void {
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
}

export function cacheStats(): { hits: number; misses: number; keys: number } {
  return { hits, misses, keys: store.size };
}
