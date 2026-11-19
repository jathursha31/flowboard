import { files } from '../db.ts';
import type { Filter, GridFSFile } from 'mongodb';

// 📎 Task attachments: MongoDB GridFS la save (thani file server / account theva illa)

export const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB (free database 512 MB thaan)
export const MAX_FILES_PER_TASK = 5;

// ✅ Intha types mattum. SVG / HTML venaam: avangalukkulla script olichu vaikkalaam (XSS)
export const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'text/plain'];

// 🗑️ Tasks azhiyumbodhu avanga files um azhi (filter: { 'metadata.taskId': id } illa { 'metadata.boardId': id })
export async function deleteFilesWhere(filter: Filter<GridFSFile>): Promise<number> {
  const list = await files.find(filter, { projection: { _id: 1 } }).toArray();
  for (const f of list) await files.delete(f._id).catch(() => {});
  return list.length;
}
