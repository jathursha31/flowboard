import express from 'express';
import { findAccessibleBoard } from '../lib/boards.ts';
import { subscribe } from '../lib/realtime.ts';

// ⚡ Live board: browser intha connection ah thirandhu vechirukkum, maarinaa server message anuppum
const router = express.Router();

router.get('/api/boards/:id/events', async (req, res) => {
  const board = await findAccessibleBoard(req, req.params.id); // 🛡️ paakka mudiyaadha board ku illa
  if (!board) return res.status(404).json({ error: 'Board not found.' });

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // hosting proxy buffer pannaama irukka
  });
  res.flushHeaders();
  res.write('retry: 5000\n\n'); // connection vizhundhaa 5 second la thirumba try

  const unsubscribe = subscribe(board._id, res);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000); // 💓 connection uyiroda irukka

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

export default router;
