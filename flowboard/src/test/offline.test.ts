import { describe, expect, it, vi } from 'vitest';
import { flushOutbox, outbox, queue, sendOrQueue } from '../offline.ts';

// 📴 Outbox: offline maatrangal varisaiyaa, temporary id → server id

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data });

describe('offline outbox', () => {
  it('queues a change when the network is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const res = await sendOrQueue('/api/tasks', 'POST', { title: 'Offline task' }, { tempId: 'tmp-abc' });
    expect(res).toEqual({ queued: true });
    expect(outbox()).toHaveLength(1);
  });

  it('does not queue real server errors (like 400)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: 'Task title is required.' }) })));
    await expect(sendOrQueue('/api/tasks', 'POST', {})).rejects.toThrow('Task title is required.');
    expect(outbox()).toHaveLength(0);
  });

  it('replays in order and swaps temporary ids for the real ones', async () => {
    queue({ url: '/api/tasks', method: 'POST', body: { title: 'A', boardId: 'b1' }, tempId: 'tmp-111' });
    queue({ url: '/api/tasks/tmp-111', method: 'PATCH', body: { title: 'A edited' } });
    queue({ url: '/api/tasks/reorder', method: 'POST', body: { boardId: 'b1', column: 'done', ids: ['t0', 'tmp-111'], movedId: 'tmp-111' } });
    const calls: [string, string, any][] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, opts: RequestInit) => {
      calls.push([String(opts.method), url, opts.body && JSON.parse(String(opts.body))]);
      return ok(url === '/api/tasks' ? { id: 'real-999' } : { ok: true });
    }));
    const result = await flushOutbox();
    expect(result).toMatchObject({ synced: 3, dropped: 0 });
    expect(calls[1][1]).toBe('/api/tasks/real-999');
    expect(calls[2][2]).toMatchObject({ ids: ['t0', 'real-999'], movedId: 'real-999' });
    expect(outbox()).toHaveLength(0);
  });

  it('stops when the network drops again and keeps the rest (with new ids)', async () => {
    queue({ url: '/api/tasks', method: 'POST', body: { title: 'B' }, tempId: 'tmp-222' });
    queue({ url: '/api/tasks/tmp-222', method: 'DELETE' });
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      n++;
      if (n === 1) return ok({ id: 'real-222' });
      throw new TypeError('Failed to fetch');
    }));
    expect(await flushOutbox()).toMatchObject({ synced: 1 });
    expect(outbox()).toEqual([expect.objectContaining({ url: '/api/tasks/real-222', method: 'DELETE' })]);
  });

  it('drops changes the server rejects (e.g. task deleted by someone else)', async () => {
    queue({ url: '/api/tasks/gone', method: 'PATCH', body: { title: 'x' } });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({ error: 'Task kidaikkala!' }) })));
    expect(await flushOutbox()).toMatchObject({ synced: 0, dropped: 1 });
    expect(outbox()).toHaveLength(0);
  });
});

describe('offline outbox: double "online" events', () => {
  it('runs only one sync at a time so nothing is sent twice', async () => {
    queue({ url: '/api/tasks', method: 'POST', body: { title: 'Once' }, tempId: 'tmp-333' });
    let posts = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      posts++;
      await new Promise((r) => setTimeout(r, 20));
      return { ok: true, status: 200, json: async () => ({ id: 'real-333' }) };
    }));
    const [a, b] = await Promise.all([flushOutbox(), flushOutbox()]);
    expect(posts).toBe(1);
    expect(a).toBe(b);
  });
});
