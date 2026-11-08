import express, { Router } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../validators/schemas.js';
import { Document, serializeDocument } from '../models/Document.js';
import { User } from '../models/User.js';
import { DOC_KINDS, STORABLE_KINDS } from '../documents/kinds.js';
import { deleteFile, openFile, putFile, sniffType } from '../documents/storage.js';
import { plainLine } from '../utils/sanitize.js';
import { send } from '../utils/http.js';
import { AppError, badRequest, notFound, unauthorized } from '../utils/errors.js';

/**
 * Private document vault. Limits keep the shared database small: PDF, JPG or
 * PNG only (checked from the file's bytes), up to 4 MB each, 15 files and
 * 10 MB per student. Aadhaar and bank documents are never stored.
 */
export const LIMITS = { maxFileBytes: 4 * 1024 * 1024, maxFiles: 15, maxTotalBytes: 10 * 1024 * 1024 };
const LINK_TTL_SECONDS = 5 * 60;
const ALL_KINDS = [...Object.keys(DOC_KINDS), 'other'];

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false,
  keyGenerator: (req) => `doc:${req.user?._id}`, skip: () => env.NODE_ENV === 'test',
  handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many uploads. Try again later.' } }),
});

const router = Router();

/** Downloads use a short-lived signed link (no session needed), so they also open in a browser or the phone. */
router.get('/file/:id', validate({ params: idParams }), async (req, res) => {
  let claims;
  try { claims = jwt.verify(String(req.query.token ?? ''), env.JWT_SECRET, { algorithms: ['HS256'] }); } catch { throw unauthorized('This download link has expired. Open it again from SarthiAI.'); }
  if (claims.purpose !== 'document' || claims.doc !== req.valid.params.id) throw unauthorized('This download link is not valid.');
  const doc = await Document.findOne({ _id: claims.doc, userId: claims.sub }).lean();
  if (!doc) throw notFound('Document not found');
  res.set({
    'Content-Type': doc.contentType,
    'Content-Length': String(doc.size),
    'Content-Disposition': `attachment; filename="${doc.fileName.replace(/[^\w.\- ]+/g, '_')}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  openFile(doc.fileId).on('error', () => res.destroy()).pipe(res);
});

router.use(requireAuth);

router.get('/', async (req, res) => {
  const docs = await Document.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
  const used = docs.reduce((n, d) => n + d.size, 0);
  send(res, { documents: docs.map(serializeDocument), have: req.user.docsHave ?? [], usage: { files: docs.length, bytes: used, ...LIMITS } });
});

router.put('/have', validate({ body: z.object({ kind: z.enum(ALL_KINDS), have: z.boolean() }) }), async (req, res) => {
  const { kind, have } = req.valid.body;
  await User.updateOne({ _id: req.user._id }, have ? { $addToSet: { docsHave: kind } } : { $pull: { docsHave: kind } });
  const u = await User.findById(req.user._id).lean();
  send(res, { have: u.docsHave ?? [] });
});

const uploadQuery = z.object({ kind: z.enum(STORABLE_KINDS), name: z.string().max(200).optional() });

router.post('/', uploadLimiter, validate({ query: uploadQuery }), express.raw({ type: () => true, limit: LIMITS.maxFileBytes }), async (req, res) => {
  const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!buf.length) throw badRequest('Choose a file to upload.');
  const contentType = sniffType(buf);
  if (!contentType) throw badRequest('Only PDF, JPG or PNG files can be uploaded.');
  const existing = await Document.find({ userId: req.user._id }).select('size').lean();
  if (existing.length >= LIMITS.maxFiles) throw badRequest(`Your vault can hold ${LIMITS.maxFiles} files. Delete one first.`);
  if (existing.reduce((n, d) => n + d.size, 0) + buf.length > LIMITS.maxTotalBytes) throw badRequest('Your vault is full (10 MB). Delete a file or upload a smaller one.');
  const ext = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }[contentType];
  const base = plainLine(req.valid.query.name ?? '').replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[^\p{L}\p{N} ._-]+/gu, '').slice(0, 100) || DOC_KINDS[req.valid.query.kind]?.label || 'Document';
  const fileName = `${base}.${ext}`;
  const fileId = await putFile(buf, { fileName, contentType, userId: req.user._id });
  const doc = await Document.create({ userId: req.user._id, kind: req.valid.query.kind, fileName, contentType, size: buf.length, fileId });
  if (req.valid.query.kind !== 'other') await User.updateOne({ _id: req.user._id }, { $addToSet: { docsHave: req.valid.query.kind } });
  send(res, serializeDocument(doc), { status: 201 });
});

/** A download link that works for 5 minutes. */
router.post('/:id/link', validate({ params: idParams }), async (req, res) => {
  const doc = await Document.findOne({ _id: req.valid.params.id, userId: req.user._id }).lean();
  if (!doc) throw notFound('Document not found');
  const token = jwt.sign({ purpose: 'document', doc: String(doc._id) }, env.JWT_SECRET, { subject: String(req.user._id), expiresIn: LINK_TTL_SECONDS, algorithm: 'HS256' });
  send(res, { url: `/api/documents/file/${doc._id}?token=${encodeURIComponent(token)}`, expiresInSeconds: LINK_TTL_SECONDS });
});

router.delete('/:id', validate({ params: idParams }), async (req, res) => {
  const doc = await Document.findOneAndDelete({ _id: req.valid.params.id, userId: req.user._id });
  if (!doc) throw notFound('Document not found');
  await deleteFile(doc.fileId);
  send(res, { deleted: true });
});

/** Removes every vault file of a student (account deletion). */
export async function deleteAllDocuments(userId) {
  const docs = await Document.find({ userId }).lean();
  await Promise.all(docs.map((d) => deleteFile(d.fileId)));
  await Document.deleteMany({ userId });
}

export { AppError };
export default router;
