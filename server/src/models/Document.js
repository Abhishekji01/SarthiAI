import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * A file in the student's private vault. The bytes live in GridFS
 * (bucket "documents"); this record holds what the app shows. Only the owner
 * can list or download it, through short-lived signed links.
 */
const documentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, required: true, maxlength: 40 },
    fileName: { type: String, required: true, maxlength: 120 },
    contentType: { type: String, enum: ['application/pdf', 'image/jpeg', 'image/png'], required: true },
    size: { type: Number, required: true },
    fileId: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true },
);

export const Document = mongoose.model('Document', documentSchema);

export const serializeDocument = (d) => ({ id: String(d._id), kind: d.kind, fileName: d.fileName, contentType: d.contentType, size: d.size, createdAt: d.createdAt });
