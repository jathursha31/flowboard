import express from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { requireUser } from '../lib/auth.ts';
import { canEditBoard, findAccessibleTask, toTask, VIEW_ONLY } from '../lib/boards.ts';
import { must, toObjectId } from '../lib/helpers.ts';
import { publish } from '../lib/realtime.ts';
import { ALLOWED_TYPES, MAX_FILE_BYTES, MAX_FILES_PER_TASK } from '../lib/attachments.ts';
import { files, tasks } from '../db.ts';
import { logActivity } from '../lib/activity.ts';

// 📎 Task la file attach: upload, download, delete
const router = express.Router();

// ⬆️ Upload: body = file bytes apdiye, header la file peru (X-File-Name)
router.post(
  '/api/tasks/:id/attachments',
  requireUser,
  express.raw({ type: ALLOWED_TYPES, limit: MAX_FILE_BYTES }),
  async (req, res) => {
    const found = await findAccessibleTask(req, req.params.id);
    if (!found) return res.status(404).json({ error: 'Task kidaikkala!' });
    if (!canEditBoard(req, found.board)) return res.status(403).json(VIEW_ONLY); // 👀

    const type = req.get('content-type')?.split(';')[0].trim() ?? '';
    if (!ALLOWED_TYPES.includes(type) || !Buffer.isBuffer(req.body)) {
      return res.status(415).json({ error: 'Only images (PNG, JPG, GIF, WebP), PDF and text files are allowed.' });
    }
    if (req.body.length === 0) return res.status(400).json({ error: 'The file is empty.' });
    if ((found.task.attachments ?? []).length >= MAX_FILES_PER_TASK) {
      return res.status(400).json({ error: `Up to ${MAX_FILES_PER_TASK} files per task.` });
    }

    let name = 'file';
    try {
      name = decodeURIComponent(req.get('x-file-name') || 'file');
    } catch {
      /* thappaana peru: "file" */
    }
    name = name.replace(/[\\/\r\n"]/g, '_').slice(0, 100) || 'file'; // 🧹 aabaththaana letters eduthudu

    const upload = files.openUploadStream(name, {
      metadata: { taskId: found.task._id, boardId: found.board._id, uploadedBy: req.user!._id, contentType: type },
    });
    await pipeline(Readable.from(req.body), upload);

    const attachment = { id: String(upload.id), name, size: req.body.length, type, uploadedAt: new Date() };
    const updated = must(await tasks.findOneAndUpdate(
      { _id: found.task._id },
      { $push: { attachments: attachment } },
      { returnDocument: 'after' }
    ));
    await logActivity(req, found.board, updated, 'attached', name);
    publish(found.board._id, 'tasks', req);
    res.status(201).json(toTask(updated));
  }
);

// ⬇️ Download / paakka (board access irundhaa mattum)
router.get('/api/attachments/:fileId', async (req, res) => {
  const _id = toObjectId(req.params.fileId);
  const file = _id && (await files.find({ _id }).next());
  const found = file?.metadata && (await findAccessibleTask(req, String(file.metadata.taskId)));
  if (!found) return res.status(404).json({ error: 'File not found.' });

  const type: string = file!.metadata!.contentType;
  const inline = type.startsWith('image/') || type === 'application/pdf';
  res.set({
    'Content-Type': type,
    'Content-Length': String(file.length),
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    'X-Content-Type-Options': 'nosniff', // 🛡️ browser type ah "guess" panni script ah run pannakoodaadhu
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    'Cache-Control': 'private, max-age=3600',
  });
  await pipeline(files.openDownloadStream(_id!), res);
});

// 🗑️ Attachment azhi
router.delete('/api/tasks/:id/attachments/:fileId', requireUser, async (req, res) => {
  const found = await findAccessibleTask(req, req.params.id);
  if (!found) return res.status(404).json({ error: 'Task kidaikkala!' });
  if (!canEditBoard(req, found.board)) return res.status(403).json(VIEW_ONLY);
  const exists = (found.task.attachments ?? []).some((a) => a.id === req.params.fileId);
  if (!exists) return res.status(404).json({ error: 'File not found.' });

  await files.delete(must(toObjectId(req.params.fileId), 'File')).catch(() => {});
  const updated = must(await tasks.findOneAndUpdate(
    { _id: found.task._id },
    { $pull: { attachments: { id: req.params.fileId } } },
    { returnDocument: 'after' }
  ));
  publish(found.board._id, 'tasks', req);
  res.json(toTask(updated));
});

export default router;
