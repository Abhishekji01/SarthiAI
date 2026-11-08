import mongoose from 'mongoose';
import { Readable } from 'node:stream';

/** GridFS bucket for vault files (same MongoDB database; no extra service or credentials). */
const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'documents' });

export async function putFile(buffer, { fileName, contentType, userId }) {
  const upload = bucket().openUploadStream(fileName, { metadata: { userId: String(userId), contentType } });
  await new Promise((resolve, reject) => Readable.from(buffer).pipe(upload).on('finish', resolve).on('error', reject));
  return upload.id;
}

export const openFile = (fileId) => bucket().openDownloadStream(fileId);

export async function deleteFile(fileId) {
  try { await bucket().delete(fileId); } catch { /* already gone */ }
}

/** What a file really is, from its first bytes (the browser's Content-Type is not trusted). */
export function sniffType(buf) {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf.length >= 8 && buf[0] === 0x89 && buf.subarray(1, 4).toString('latin1') === 'PNG') return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  return null;
}
