import type { Request, Response } from 'express';
import { connectDb } from '../db.ts';
import { runMigrations } from '../lib/boards.ts';
import { createApp } from '../app.ts';

// ▲ Vercel entry: "eppovum oadura server" illa, ovvoru request kkum function
// app.listen / setInterval illa: DB connection mattum oru thadavai (function warm ah irukkura varai reuse aagum)
// Website files (flowboard/dist) Vercel CDN serve pannum (vercel.json), adhanaala inga staticDir illa

const { MONGODB_URI, ADMIN_PASSWORD } = process.env;
let ready: Promise<void> | null = null;
const start = () => {
  if (!MONGODB_URI || !ADMIN_PASSWORD) throw new Error('Set MONGODB_URI and ADMIN_PASSWORD in Vercel → Settings → Environment Variables');
  ready ??= (async () => {
    await connectDb(MONGODB_URI, process.env.MONGODB_DB?.endsWith('_test') ? process.env.MONGODB_DB : 'flowboard'); // tests ku mattum _test DB
    await runMigrations();
  })().catch((err) => {
    ready = null; // adutha request la thirumba try
    throw err;
  });
  return ready;
};

const app = createApp();

export default async function handler(req: Request, res: Response) {
  try {
    await start();
  } catch (err) {
    console.error('❌ Startup failed:', (err as Error).message);
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Server is starting or misconfigured. Try again in a moment.' }));
    return;
  }
  return app(req, res);
}
