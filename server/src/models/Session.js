import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * One signed-in device. Its id is the `sid` claim in the session token, so a
 * single device can be signed out without ending the others. Expired records
 * are removed by MongoDB (TTL index).
 */
const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['cookie', 'bearer'], required: true },
    userAgent: { type: String, maxlength: 200 },
    revokedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.model('Session', sessionSchema);
