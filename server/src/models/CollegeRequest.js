import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * A student's "My institution isn't listed". The student is linked at once to an
 * unlisted College record with the typed name; a platform admin then approves it
 * (it becomes listed), merges it into an existing college (students move over),
 * or rejects it (the student keeps their typed name; it never appears in search).
 */
const collegeRequestSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    city: { type: String, trim: true, maxlength: 60 },
    state: { type: String, trim: true, maxlength: 60 },
    collegeId: { type: Schema.Types.ObjectId, ref: 'College', required: true, unique: true },
    requestedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    status: { type: String, enum: ['pending', 'approved', 'merged', 'rejected'], default: 'pending', index: true },
    mergedInto: { type: Schema.Types.ObjectId, ref: 'College', default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const CollegeRequest = mongoose.model('CollegeRequest', collegeRequestSchema);

export const serializeCollegeRequest = (r) => ({
  id: String(r._id), name: r.name, city: r.city ?? null, state: r.state ?? null, collegeId: String(r.collegeId),
  students: (r.requestedBy ?? []).length, status: r.status, mergedInto: r.mergedInto ? String(r.mergedInto) : null, createdAt: r.createdAt,
});
