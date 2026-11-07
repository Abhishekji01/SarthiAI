import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireAI } from './provider.js';
import { profileForModel, opportunityForModel, opportunityBrief, ELIGIBILITY_LABEL, PRIVATE_FIELDS_NOTICE, UNTRUSTED_NOTICE, istDate } from './context.js';
import { DEADLINE_WINDOWS, deadlineWindowEnd } from '../utils/dates.js';
import { buildEvidence, findUngroundedClaims } from './grounding.js';
import { searchOpportunities, getVisibleOpportunity, recommendedMatches } from '../services/opportunities.js';
import { getDeadlines, getNextMoves } from '../services/nextMoves.js';
import { checkEligibility } from '../eligibility/engine.js';
import { computeAvailability, OPPORTUNITY_TYPES } from '../models/Opportunity.js';
import { Roadmap } from '../models/Roadmap.js';
import { Application } from '../models/Application.js';
import { logger } from '../utils/logger.js';

const MAX_STEPS = 6;

export const SAATHI_INSTRUCTIONS = `You are Sarthi, the AI guide inside SarthiAI, a student-success app for college students in India.

Rules you must always follow:
1. Facts about opportunities, deadlines, eligibility, applications, and the student's profile must come ONLY from tool results in this conversation. Never invent opportunities, organizations, deadlines, stipends, amounts, eligibility rules, statistics, or outcomes. If a tool returns nothing, say so plainly and suggest a next step.
2. Eligibility comes from the check_eligibility tool, which is deterministic. Explain its result; never override it, never call it official, and remind the student to confirm on the official source.
3. You cannot save, track, submit, send, or change anything yourself. To suggest one of these, call a propose_* tool. The student must confirm it in the app. Never say an action was done — say you have prepared it for them to confirm.
4. Never claim an application was submitted. Never ask for portal passwords, Aadhaar, or bank details.
5. Do not infer sensitive personal attributes (gender, caste, disability, religion, income). If a criterion depends on one, say the student should check it themselves. Income, home state and other private scholarship details are never shared with you (get_my_profile marks them private). If the student asks about them, say "That's kept private from me; eligibility checks use it automatically." Never say their profile does not list it, and never ask them to type it in the chat.
6. ${UNTRUSTED_NOTICE}
7. Be concise, warm, and practical. Use short paragraphs or brief lists. Mention when a listing is unverified, stale, closed, or has an unknown deadline. Refer to opportunities by their exact title.
8. Today's date is provided below. Use it for "days left" calculations.
9. Work step by step: for "what should I apply to" questions call get_recommendations (and search_opportunities for a specific field) before answering; for "am I eligible" call check_eligibility for each listing you discuss. Prefer calling tools in parallel when you need several.
12. For any question about a time window — "this month", "this week", "upcoming", "closing soon", "is mahine", "is hafte" — call search_opportunities with deadline_window (plus type when the student names one, e.g. scholarships). It returns every matching listing sorted by deadline. Mention every result (group them if there are many), not just the first one; say which ones need the student to "confirm eligibility", and mention how many were left out as likely not eligible.
13. If nothing matches, say so plainly without naming unrelated listings.
10. When you state a deadline or an amount, copy it exactly from a tool result and name the listing it belongs to. If a value is "unknown", say it is unknown.
11. Reply in the language the student writes in (English, Hindi or Hinglish are all fine).`;

const idArg = z.object({ opportunity_id: z.string().regex(/^[a-f\d]{24}$/i) });

const TOOLS = [
  { name: 'get_my_profile', description: "Read the signed-in student's SarthiAI profile (education, skills, interests, goals, projects).", parameters: { type: 'object', properties: {}, additionalProperties: false } },
  {
    name: 'search_opportunities',
    description: 'Search published opportunities visible to this student. Use deadline_window for "this month / this week / upcoming / closing soon" questions: it returns ALL listings closing in that window (up to 25), soonest deadline first, each labelled "likely eligible", "confirm eligibility" or "check the official source"; listings a required criterion rules out are left out and counted. Without a window, returns ranked results with match explanations.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords such as a skill, field, or organization. Leave empty to list everything of a type or window.' },
        type: { type: 'string', enum: OPPORTUNITY_TYPES },
        deadline_window: { type: 'string', enum: DEADLINE_WINDOWS, description: 'Only listings whose deadline falls between today and the end of this window (India time).' },
        deadline_within_days: { type: 'integer', minimum: 1, maximum: 365, description: 'Alternative to deadline_window: deadline within this many days.' },
        sort: { type: 'string', enum: ['relevance', 'deadline'] },
        include_closed: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: 25 },
      },
      additionalProperties: false,
    },
  },
  { name: 'get_recommendations', description: 'Get the best verified, currently open or upcoming opportunities for this student, excluding ones they are likely ineligible for.', parameters: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_opportunity', description: 'Get full details of one opportunity by id.', parameters: { type: 'object', properties: { opportunity_id: { type: 'string' } }, required: ['opportunity_id'], additionalProperties: false } },
  { name: 'check_eligibility', description: 'Run the deterministic eligibility check for one opportunity against the student profile.', parameters: { type: 'object', properties: { opportunity_id: { type: 'string' } }, required: ['opportunity_id'], additionalProperties: false } },
  { name: 'get_my_deadlines', description: "List the student's upcoming deadlines and next actions from their tracker and saved items.", parameters: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_next_moves', description: "Get SarthiAI's deterministic next-step recommendations for the student.", parameters: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_my_roadmap', description: "Get the student's active roadmap and milestone progress.", parameters: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_my_applications', description: "List the student's tracked applications and statuses.", parameters: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'propose_save_opportunity', description: 'Prepare a "save opportunity" action for the student to confirm.', parameters: { type: 'object', properties: { opportunity_id: { type: 'string' } }, required: ['opportunity_id'], additionalProperties: false } },
  {
    name: 'propose_track_application',
    description: 'Prepare an "add to application tracker" action for the student to confirm. Does not apply anywhere.',
    parameters: { type: 'object', properties: { opportunity_id: { type: 'string' }, next_action: { type: 'string', maxLength: 200 } }, required: ['opportunity_id'], additionalProperties: false },
  },
  {
    name: 'propose_generate_roadmap',
    description: 'Prepare a roadmap-generation action for the student to confirm.',
    parameters: { type: 'object', properties: { goal: { type: 'string', maxLength: 200 }, opportunity_id: { type: 'string' } }, required: ['goal'], additionalProperties: false },
  },
  { name: 'propose_draft_email', description: 'Prepare an application-email draft action for the student to confirm and review.', parameters: { type: 'object', properties: { opportunity_id: { type: 'string' } }, required: ['opportunity_id'], additionalProperties: false } },
];

/**
 * Executes one tool call with the authenticated user's identity. Returns a
 * JSON-serializable result. Errors are reported back to the model as data.
 */
async function executeTool(name, rawArgs, ctx) {
  let args = {};
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return { error: 'Arguments were not valid JSON.' };
  }
  const { user, now } = ctx;
  const remember = (o) => ctx.seen.set(String(o._id ?? o.id), { opportunityId: String(o._id ?? o.id), title: o.title, sourceUrl: o.sourceUrl, verificationStatus: o.verificationStatus });

  switch (name) {
    case 'get_my_profile':
      return { ...profileForModel(user), privateFields: PRIVATE_FIELDS_NOTICE };
    case 'search_opportunities':
      return searchTool(args, ctx, remember);
    case 'get_recommendations': {
      const { items, excludedIneligible } = await recommendedMatches(user, { limit: 6, now, tier: 'all', possibleLimit: 4 });
      items.forEach(remember);
      return {
        excludedBecauseLikelyIneligible: excludedIneligible,
        note: 'tier "recommended" = at least one criterion confirmed from the profile; tier "possible" = open and not ruled out, but fit could not be confirmed. Say which is which.',
        results: items.map((o) => ({ ...opportunityForModel(o), tier: o.tier, matchScore: o.match.score, confidence: o.match.confidence, eligibility: o.match.eligibilityOverall, whyItMatches: o.match.factors.map((f) => `${f.positive ? '+' : '-'} ${f.detail}`) })),
      };
    }
    case 'get_opportunity': {
      const parsed = idArg.safeParse(args);
      if (!parsed.success) return { error: 'Invalid opportunity id.' };
      try {
        const o = await getVisibleOpportunity(user, parsed.data.opportunity_id);
        remember(o);
        return { ...opportunityForModel({ ...o, availability: computeAvailability(o, now) }), requiredDocuments: o.requiredDocuments ?? [], deadlineNote: o.deadlineNote ?? null };
      } catch {
        return { error: 'Opportunity not found or not visible to this student.' };
      }
    }
    case 'check_eligibility': {
      const parsed = idArg.safeParse(args);
      if (!parsed.success) return { error: 'Invalid opportunity id.' };
      try {
        const o = await getVisibleOpportunity(user, parsed.data.opportunity_id);
        remember(o);
        const r = checkEligibility(o, user.profile, { now });
        return { opportunity: o.title, overall: r.overall, criteria: r.criteria.map((c) => ({ requirement: c.requirement, status: c.status, mandatory: c.mandatory, explanation: c.explanation, nextStep: c.nextStep })), caveats: r.caveats.map((c) => c.message), disclaimer: r.disclaimer };
      } catch {
        return { error: 'Opportunity not found or not visible to this student.' };
      }
    }
    case 'get_my_deadlines':
      return { deadlines: (await getDeadlines(user, { now })).map((d) => ({ ...d, date: istDate(d.date) })) };
    case 'get_next_moves':
      return { moves: await getNextMoves(user, { now }) };
    case 'get_my_roadmap': {
      const r = await Roadmap.findOne({ userId: user._id, status: 'active' }).lean();
      if (!r) return { roadmap: null };
      return { goal: r.goal, milestones: r.milestones.map((m) => ({ title: m.title, status: m.status, priority: m.priority, nextStep: m.steps?.[0] ?? null })) };
    }
    case 'get_my_applications': {
      const apps = await Application.find({ userId: user._id, archived: false }).sort({ updatedAt: -1 }).limit(20).lean();
      return { applications: apps.map((a) => ({ title: a.title, organization: a.organization ?? null, status: a.status, deadline: a.deadline ? istDate(a.deadline) : null, nextAction: a.nextAction ?? null })) };
    }
    case 'propose_save_opportunity':
    case 'propose_track_application':
    case 'propose_draft_email': {
      const parsed = idArg.extend({ next_action: z.string().max(200).optional() }).safeParse(args);
      if (!parsed.success) return { error: 'Invalid opportunity id.' };
      let o;
      try {
        o = await getVisibleOpportunity(user, parsed.data.opportunity_id);
      } catch {
        return { error: 'Opportunity not found or not visible to this student.' };
      }
      remember(o);
      const type = { propose_save_opportunity: 'save_opportunity', propose_track_application: 'track_application', propose_draft_email: 'draft_email' }[name];
      const label = { save_opportunity: `Save "${o.title}"`, track_application: `Track "${o.title}"`, draft_email: `Draft an email for "${o.title}"` }[type];
      const proposal = { id: randomUUID(), type, opportunityId: String(o._id), title: o.title, label, nextAction: parsed.data.next_action ?? null, goal: null };
      ctx.proposals.push(proposal);
      return { status: 'awaiting_student_confirmation', note: 'Nothing has been changed. The student will see a confirm button.' };
    }
    case 'propose_generate_roadmap': {
      const parsed = z.object({ goal: z.string().min(3).max(200), opportunity_id: z.string().regex(/^[a-f\d]{24}$/i).optional() }).safeParse(args);
      if (!parsed.success) return { error: 'Provide a goal of at least 3 characters.' };
      ctx.proposals.push({ id: randomUUID(), type: 'generate_roadmap', opportunityId: parsed.data.opportunity_id ?? null, title: null, label: `Build a roadmap: ${parsed.data.goal}`, nextAction: null, goal: parsed.data.goal });
      return { status: 'awaiting_student_confirmation', note: 'Nothing has been generated yet. The student will see a confirm button.' };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}

const searchArgs = z.object({
  query: z.string().max(120).optional(),
  type: z.enum(OPPORTUNITY_TYPES).optional(),
  deadline_window: z.enum(DEADLINE_WINDOWS).optional(),
  deadline_within_days: z.number().int().min(1).max(365).optional(),
  sort: z.enum(['relevance', 'deadline']).optional(),
  include_closed: z.boolean().optional(),
  limit: z.number().int().min(1).max(25).optional(),
});

/** search_opportunities. Exported for evaluation tests. */
export async function searchTool(args, ctx, remember = () => {}) {
  const parsed = searchArgs.safeParse(args);
  if (!parsed.success) return { error: 'Invalid search arguments.' };
  const a = parsed.data;
  const { user, now } = ctx;
  const windowed = Boolean(a.deadline_window || a.deadline_within_days);
  const { items, meta } = await searchOpportunities(user, {
    q: a.query || undefined,
    type: a.type,
    includeClosed: windowed ? false : (a.include_closed ?? false),
    deadlineBefore: a.deadline_window ? deadlineWindowEnd(a.deadline_window, now) : undefined,
    deadlineWithinDays: a.deadline_window ? undefined : a.deadline_within_days,
    excludeLikelyIneligible: windowed,
    sort: a.sort ?? (windowed ? 'deadline' : 'relevance'),
    page: 1,
    limit: a.limit ?? (windowed ? 20 : 5),
  }, now);
  items.forEach(remember);
  const long = items.length > 8;
  return {
    total: meta.total,
    returned: items.length,
    ...(windowed ? { window: a.deadline_window ?? `next ${a.deadline_within_days} days`, windowEnds: a.deadline_window ? istDate(deadlineWindowEnd(a.deadline_window, now)) : null, excludedBecauseLikelyNotEligible: meta.excludedLikelyIneligible ?? 0 } : {}),
    relaxedSearch: Boolean(meta.search?.relaxed),
    results: items.map((o) => ({
      ...(long ? opportunityBrief(o) : opportunityForModel(o)),
      eligibility: ELIGIBILITY_LABEL[o.match.eligibilityOverall] ?? o.match.eligibilityOverall,
      ...(long ? {} : { matchScore: o.match.score, whyItMatches: o.match.factors.map((f) => `${f.positive ? '+' : '-'} ${f.detail}`) }),
    })),
  };
}

const normTitle = (s) => String(s ?? '').toLowerCase().replace(/[‘’“”"'`]/g, '').replace(/[–—-]/g, ' ').replace(/\s+/g, ' ').trim();

/** Citations only for listings the reply actually names (by id or title). */
export function citationsMentioned(text, seen) {
  const body = normTitle(text);
  return seen.filter((c) => text.includes(c.opportunityId) || (normTitle(c.title).length >= 4 && body.includes(normTitle(c.title))));
}

/** Short profile snapshot so the model does not need a tool call for basics. */
function profileSnapshot(user) {
  const p = profileForModel(user);
  const parts = [
    p.degree && `${p.degree}${p.branch ? ` ${p.branch}` : ''}`,
    p.currentYear && `year ${p.currentYear}`,
    p.college && `at ${p.college}`,
    p.skills.length && `skills: ${p.skills.slice(0, 12).join(', ')}`,
    p.interests.length && `interests: ${p.interests.slice(0, 8).join(', ')}`,
    p.careerGoal && `goal: ${p.careerGoal}`,
  ].filter(Boolean);
  return parts.length ? parts.join('; ') : 'profile mostly empty — suggest completing it';
}

export async function runSaathi(user, { messages, contextOpportunityId }, { now = new Date() } = {}) {
  const ai = requireAI();
  const ctx = { user, now, seen: new Map(), proposals: [], toolsUsed: [] };
  const today = istDate(now);

  const contextLine = contextOpportunityId
    ? `\nThe student is currently viewing opportunity id ${contextOpportunityId}. Use get_opportunity if relevant.`
    : '';
  const instructions = `${SAATHI_INSTRUCTIONS}\nToday's date: ${today}.\nStudent snapshot (from their profile; use get_my_profile for projects and details): ${profileSnapshot(user)}.${contextLine}`;

  const input = messages.slice(-20).map((m) => ({ role: m.role, content: m.content }));
  const evidenceTexts = messages.filter((m) => m.role === 'user').map((m) => m.content);
  let text = '';
  for (let step = 0; step < MAX_STEPS; step += 1) {
    const response = await ai.respond({ instructions, input, tools: TOOLS });
    if (!response.toolCalls.length) {
      text = response.text;
      break;
    }
    // Echo the model's own turn back unchanged (keeps provider-specific call metadata).
    input.push({ type: 'model_content', content: response.rawContent });
    const outputs = await Promise.all(response.toolCalls.map(async (call) => {
      ctx.toolsUsed.push(call.name);
      try {
        return await executeTool(call.name, call.arguments, ctx);
      } catch (err) {
        logger.warn('Sarthi tool failed', { tool: call.name, error: err });
        return { error: 'This tool failed. Tell the student the information is temporarily unavailable.' };
      }
    }));
    response.toolCalls.forEach((call, i) => {
      const output = JSON.stringify(outputs[i]);
      evidenceTexts.push(output);
      input.push({ type: 'tool_result', callId: call.callId, name: call.name, output });
    });
    if (step === MAX_STEPS - 1) text = response.text;
  }

  if (!text?.trim()) {
    text = ctx.proposals.length
      ? 'I have prepared the action below. Please review and confirm it.'
      : "I couldn't finish that request. Please try rephrasing it.";
  }

  // ---- Grounding: every date and rupee amount must come from tool results ----
  const evidence = buildEvidence(evidenceTexts);
  let ungrounded = findUngroundedClaims(text, evidence, { today });
  let groundingStatus = 'verified';
  if (ungrounded.length) {
    try {
      const fix = await ai.respond({
        instructions,
        input: [
          ...input,
          { role: 'assistant', content: text },
          { role: 'user', content: `[Automatic fact check — not from the student] These values in your reply do not appear in any tool result: ${ungrounded.map((c) => c.text).join(', ')}. Rewrite the reply without them, or replace them with the exact values from the tool results. Do not mention this check.` },
        ],
        tools: [],
      });
      const revised = fix.text?.trim();
      if (revised) {
        const remaining = findUngroundedClaims(revised, evidence, { today });
        if (remaining.length < ungrounded.length) {
          text = revised;
          ungrounded = remaining;
          groundingStatus = remaining.length ? 'unverified' : 'corrected';
        } else groundingStatus = 'unverified';
      } else groundingStatus = 'unverified';
    } catch (err) {
      logger.warn('Grounding repair failed', { error: err });
      groundingStatus = 'unverified';
    }
  }

  // Only listings the reply names; "I couldn't find X" gets no citations.
  const citations = citationsMentioned(text, [...ctx.seen.values()]);
  return {
    reply: text.trim(),
    citations,
    proposedActions: ctx.proposals,
    toolsUsed: [...new Set(ctx.toolsUsed)],
    grounding: { status: groundingStatus, unverifiedClaims: ungrounded.map((c) => c.text) },
    model: ai.model,
  };
}
