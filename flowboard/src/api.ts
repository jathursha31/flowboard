// 🧑‍🍳 Server ku request anuppura helper (waiter!)
// Demo.jsx um AuthBox.jsx um use pannuradhaala thani file la vechirukkom

// 🆕 ⚡ Intha browser tab ku oru id: live update vandhaa "naan thaan maathinen" nu therinjukka
export const CLIENT_ID = Math.random().toString(36).slice(2, 12);

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

// T = server enna anuppum nu sonnaa (api<Task>(...)) adhu type aagum.
// Sollalana `any`: network la vara JSON ah TypeScript ku munnaadiye theriyaadhu
export async function api<T = any>(url: string, method: Method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Client-Id': CLIENT_ID },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  // ❌ Server error sonnaa, antha message ah thirumba anuppu ("Wrong email or password." maari)
  if (!res.ok) throw new Error(data.error || 'Server error');
  return data as T;
}