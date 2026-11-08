import mongoose from 'mongoose';

const { Schema } = mongoose;

/** A Find search the student saved (its URL parameters), optionally with daily email alerts. */
const savedSearchSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    params: { type: Map, of: String, required: true },
    alerts: { type: Boolean, default: false },
    // Listings created after this are "new" for the next alert.
    lastCheckedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const SavedSearch = mongoose.model('SavedSearch', savedSearchSchema);

export function serializeSavedSearch(s) {
  const params = s.params instanceof Map ? Object.fromEntries(s.params) : s.params ?? {};
  return { id: String(s._id), name: s.name, params, query: new URLSearchParams(params).toString(), alerts: s.alerts, createdAt: s.createdAt };
}
