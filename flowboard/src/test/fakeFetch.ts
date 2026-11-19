import { vi } from 'vitest';

// 🎭 Fake server: URL → badhil. Unmaiyaana server theva illaama components ah test panna
// routes = { 'GET /api/search': (url, body) => ({...}) }
type Handler = (url: string, body: unknown) => unknown;
export interface Call {
  method: string;
  url: string;
  body: unknown;
}

export function fakeFetch(routes: Partial<Record<string, Handler>>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, options: RequestInit = {}) => {
    const method = options.method ?? 'GET';
    const path = String(url).split('?')[0];
    const body = options.body ? JSON.parse(String(options.body)) : undefined;
    calls.push({ method, url: String(url), body });
    const handler = routes[`${method} ${path}`];
    const data = handler ? handler(String(url), body) : { error: 'not mocked' };
    return { ok: handler !== undefined, status: handler ? 200 : 404, json: async () => data };
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}
