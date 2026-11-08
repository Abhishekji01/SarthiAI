import mongoose from 'mongoose';

const { Schema } = mongoose;

/** Failed sign-in counters per email and per IP. Forgotten 15 minutes after the last failure. */
const throttleSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    fails: { type: Number, default: 0 },
    lastFailAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);
throttleSchema.index({ lastFailAt: 1 }, { expireAfterSeconds: 15 * 60 });

export const LoginThrottle = mongoose.model('LoginThrottle', throttleSchema);
