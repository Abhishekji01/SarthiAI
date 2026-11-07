import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * A student's own Yes/No answer to a criterion SarthiAI can't verify
 * ("You meet every condition in the official guidelines"), remembered per
 * opportunity so the check and the rankings use it next time. Deletable.
 */
const answerSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    opportunityId: { type: Schema.Types.ObjectId, ref: 'Opportunity', required: true },
    key: { type: String, required: true, maxlength: 60 },
    answer: { type: Boolean, required: true },
  },
  { timestamps: true },
);
answerSchema.index({ userId: 1, opportunityId: 1, key: 1 }, { unique: true });

export const EligibilityAnswer = mongoose.model('EligibilityAnswer', answerSchema);

/** { opportunityId: { ruleKey: true|false } } for this student (optionally only some listings). */
export async function answersFor(userId, opportunityIds) {
  const q = { userId, ...(opportunityIds ? { opportunityId: { $in: opportunityIds } } : {}) };
  const rows = await EligibilityAnswer.find(q).select('opportunityId key answer').lean();
  const map = new Map();
  for (const r of rows) {
    const id = String(r.opportunityId);
    if (!map.has(id)) map.set(id, {});
    map.get(id)[r.key] = r.answer;
  }
  return map;
}
