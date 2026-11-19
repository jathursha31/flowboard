import type { Request, Response } from 'express';

// ⚡ Real-time: board la yaaraavadhu edhaavadhu maathinaa, adhe board paakkura ellaarukkum udane sollu
// Server-Sent Events (SSE): browser oru connection thirandhu vechirukkum, server adhula message thallum.
// (WebSocket maadhiri, aana Node + browser la ulla irukku: package theva illa)

const listeners = new Map<string, Set<Response>>(); // boardId → open responses

// 📡 Oru browser ah intha board ku "subscribe" pannu
export function subscribe(boardId: unknown, res: Response): () => void {
  const key = String(boardId);
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(res);
  return () => {
    const set = listeners.get(key);
    set?.delete(res);
    if (set?.size === 0) listeners.delete(key);
  };
}

// 📣 Intha board paakkura ellaarukkum "maarirukku" nu sollu
// type: 'tasks' (tasks maarichu), 'board' (peru / columns / members maarichu) illa 'chat' (pudhu chat message)
// by: yaar maathinaanga (avanga browser tab id: avangalukku thirumba anuppa vendaam)
export function publish(boardId: unknown, type: 'tasks' | 'board' | 'chat', req?: Request): void {
  const set = listeners.get(String(boardId));
  if (!set) return;
  const data = JSON.stringify({ type, by: req?.get('x-client-id') ?? null });
  for (const res of set) res.write(`data: ${data}\n\n`);
}

// 🔢 Tests ku: ethanai per paakkuraanga
export function listenerCount(boardId: unknown): number {
  return listeners.get(String(boardId))?.size ?? 0;
}
