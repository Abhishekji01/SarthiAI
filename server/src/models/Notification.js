import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * One record per notification sent, so a reminder or digest is never sent twice
 * (unique key per user, e.g. "deadline:<oppId>:3d" or "digest:2026-W46").
 * Records older than a year are removed.
 */
const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    key: { type: String, required: true, maxlength: 200 },
    channel: { type: String, enum: ['email', 'whatsapp'], default: 'email' },
    delivered: { type: Boolean, default: false },
  },
  { timestamps: true },
);
notificationSchema.index({ userId: 1, key: 1, channel: 1 }, { unique: true });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 366 * 86400 });
export const Notification = mongoose.model('Notification', notificationSchema);

/** "Tell me when the dates are announced" for a listing without a deadline. */
const dateWatchSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    opportunityId: { type: Schema.Types.ObjectId, ref: 'Opportunity', required: true },
    notifiedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
dateWatchSchema.index({ userId: 1, opportunityId: 1 }, { unique: true });
dateWatchSchema.index({ notifiedAt: 1, opportunityId: 1 });
export const DateWatch = mongoose.model('DateWatch', dateWatchSchema);
