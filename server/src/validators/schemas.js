import { z } from 'zod';
import { OPPORTUNITY_TYPES, SOURCE_TYPES, DECLARED_STATUSES, OPP_WORK_MODES, RULE_KINDS } from '../models/Opportunity.js';
import { APPLICATION_STATUSES } from '../models/Application.js';
import { MILESTONE_STATUSES, PRIORITIES } from '../models/Roadmap.js';
import { ANNOUNCEMENT_CATEGORIES } from '../models/Announcement.js';
import { DRAFT_KINDS } from '../models/Draft.js';
import { passwordSchema } from '../auth/passwordRules.js';
import { plainLine, plainText } from '../utils/sanitize.js';
import { LIMITS, cgpaNumberError, tagListError } from '../../../shared/profileRules.js';
import { isHomeStateOption } from '../../../shared/states.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const str = (max) => z.string().trim().max(max);
/** Text people type: tags and control characters removed, then length-checked. */
const line = (max) => z.string().transform(plainLine).pipe(z.string().max(max));
const text = (max) => z.string().transform(plainText).pipe(z.string().max(max));
const httpsUrl = z.string().trim().url().max(500).refine((u) => /^https?:\/\//i.test(u), 'Must be an http(s) URL');
// null must be tried first: z.coerce.date() turns null into 1970-01-01.
const optionalDate = z.union([z.null(), z.coerce.date()]).optional();
const tagList = (max = 30, len = 60) => z.array(str(len).min(1)).max(max);

// ---- Auth ---------------------------------------------------------------

export const registerSchema = z.object({
  name: line(100).pipe(z.string().min(1, 'Name is required')),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
  password: passwordSchema,
}).strict();

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
});

export const verifyEmailSchema = z.object({
  token: z.string().trim().regex(/^[A-Za-z0-9_-]{32,128}$/, 'This confirmation link is invalid or has expired.'),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().regex(/^[A-Za-z0-9_-]{32,128}$/, 'This reset link is invalid or has expired.'),
  password: passwordSchema,
});

// ---- Profile ------------------------------------------------------------

const projectInput = z.object({
  title: line(120).pipe(z.string().min(1)),
  description: text(1000).optional(),
  skills: tagList(15, 40).optional(),
  url: z.union([httpsUrl, z.literal('')]).optional(),
});

const experienceInput = z.object({
  role: line(120).pipe(z.string().min(1)),
  organization: line(120).pipe(z.string().min(1)),
  startDate: optionalDate,
  endDate: optionalDate,
  description: text(1000).optional(),
});

/** `role`, `adminCollegeIds`, `email`, `tokenVersion` are deliberately absent. */
export const profilePatchSchema = z.object({
  name: line(100).pipe(z.string().min(1, 'Name is required')).optional(),
  profile: z.object({
    collegeId: z.union([objectId, z.null()]).optional(),
    customCollegeName: line(160).pipe(z.string().min(2, 'Enter your institution’s full name')).optional(),
    degree: line(60).optional(),
    branch: line(80).optional(),
    currentYear: z.union([z.number().int().min(1).max(6), z.null()]).optional(),
    semester: z.union([z.number().int().min(1).max(12), z.null()]).optional(),
    graduationYear: z.union([z.number().int().min(2000).max(2100), z.null()]).optional(),
    cgpa: z.union([z.number().superRefine((n, ctx) => { const e = cgpaNumberError(n); if (e) ctx.addIssue({ code: 'custom', message: e }); }), z.null()]).optional(),
    skills: z.array(line(LIMITS.tagMaxLength + 20).pipe(z.string().min(1))).superRefine((l, ctx) => { const e = tagListError(l, 'skills'); if (e) ctx.addIssue({ code: 'custom', message: e }); }).optional(),
    interests: z.array(line(LIMITS.tagMaxLength + 20).pipe(z.string().min(1))).superRefine((l, ctx) => { const e = tagListError(l, 'interests'); if (e) ctx.addIssue({ code: 'custom', message: e }); }).optional(),
    careerGoal: line(300).optional(),
    headline: line(160).optional(),
    projects: z.array(projectInput).max(20).optional(),
    experience: z.array(experienceInput).max(20).optional(),
    achievements: z.array(line(300).pipe(z.string().min(1))).max(20).optional(),
    preferredLocations: z.array(line(60).pipe(z.string().min(1))).max(10).optional(),
    workModes: z.array(z.enum(['remote', 'hybrid', 'onsite'])).max(3).optional(),
    homeState: z.union([str(60).refine(isHomeStateOption, 'Choose a state or union territory from the list'), z.null()]).optional(),
    gender: z.union([z.enum(['female', 'male', 'other']), z.null()]).optional(),
    socialCategory: z.union([z.enum(['general', 'obc', 'sc', 'st', 'ews']), z.null()]).optional(),
    disability: z.union([z.boolean(), z.null()]).optional(),
    minority: z.union([z.boolean(), z.null()]).optional(),
    parentService: z.union([z.enum(['none', 'capf', 'railways', 'defence', 'state_police']), z.null()]).optional(),
    firstGeneration: z.union([z.boolean(), z.null()]).optional(),
    annualFamilyIncomeINR: z.union([z.number().int('Enter a whole number of rupees').min(0, 'Income cannot be negative').max(LIMITS.incomeMax, 'That amount looks too large'), z.null()]).optional(),
    links: z.object({
      github: z.union([httpsUrl, z.literal('')]).optional(),
      linkedin: z.union([httpsUrl, z.literal('')]).optional(),
      portfolio: z.union([httpsUrl, z.literal('')]).optional(),
    }).optional(),
  }).optional(),
  notificationPrefs: z.object({
    deadlineReminders: z.boolean().optional(),
    reminderDaysBefore: z.number().int().min(0).max(30).optional(),
    campusAnnouncements: z.boolean().optional(),
    emailDeadlines: z.boolean().optional(),
    emailDigest: z.boolean().optional(),
  }).optional(),
  completeOnboarding: z.boolean().optional(),
});

export const deleteAccountSchema = z.object({ password: z.string().min(1).max(128) });

// ---- Opportunities ------------------------------------------------------

const csv = z.string().trim().max(300).transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean));

export const opportunityQuerySchema = z.object({
  q: str(120).optional(),
  type: z.enum(OPPORTUNITY_TYPES).optional(),
  workMode: z.enum(['remote', 'hybrid', 'onsite']).optional(),
  location: str(60).optional(),
  degree: str(60).optional(),
  year: z.coerce.number().int().min(1).max(6).optional(),
  skills: csv.optional(),
  availability: z.enum(DECLARED_STATUSES).optional(),
  includeClosed: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  verifiedOnly: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  deadlineWithinDays: z.coerce.number().int().min(1).max(365).optional(),
  campusOnly: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  // Also include listings that only mention the search terms in their description.
  mentions: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  // Only listings that state an award or prize.
  hasPrize: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  sort: z.enum(['relevance', 'deadline', 'recent', 'nearby']).default('relevance'),
  // Stipend or award of at least this many rupees a year (monthly stipends count x12).
  minAnnualAmount: z.coerce.number().int().min(0).max(100000000).optional(),
  // Leave out listings a required criterion rules out for this student.
  hideIneligible: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Find's URL parameters that a saved search keeps (the same names the web app uses). */
export const SEARCH_PARAM_KEYS = ['q', 'type', 'workMode', 'location', 'within', 'hasPrize', 'verifiedOnly', 'campusOnly', 'includeClosed', 'sort', 'minAmount', 'hideIneligible'];
const searchParams = z.partialRecord(z.enum(SEARCH_PARAM_KEYS), z.string().trim().max(120)).refine((p) => Object.keys(p).length > 0, 'Choose a search or a filter first');

export const savedSearchCreateSchema = z.object({
  name: line(80).pipe(z.string().min(1, 'Give the search a name')),
  params: searchParams,
  alerts: z.boolean().default(false),
});

export const savedSearchPatchSchema = z.object({
  name: line(80).pipe(z.string().min(1)).optional(),
  alerts: z.boolean().optional(),
});

/** Turns Find's URL parameters into a search query (as GET /api/opportunities would parse them). */
export function searchQueryFromParams(params) {
  const { within, minAmount, ...rest } = params;
  return opportunityQuerySchema.parse({ ...rest, ...(within ? { deadlineWithinDays: within } : {}), ...(minAmount ? { minAnnualAmount: minAmount } : {}) });
}

export const idParams = z.object({ id: objectId });

export const matchesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(30).default(10),
  // 'all' adds clearly labelled "possible" matches after the confirmed ones.
  tier: z.enum(['recommended', 'all']).default('recommended'),
});

export const eligibilityAnswerSchema = z.object({
  opportunityId: objectId,
  key: z.string().trim().regex(/^[a-z0-9_]{1,60}$/),
  // null forgets the answer.
  answer: z.union([z.boolean(), z.null()]),
});

export const eligibilityAnswersQuery = z.object({ opportunityId: objectId.optional() });

export const eligibilityCheckSchema = z.object({
  opportunityId: objectId,
  declarations: z.record(z.string().max(60), z.boolean()).optional(),
});

// ---- Applications -------------------------------------------------------

export const applicationCreateSchema = z.object({
  opportunityId: objectId.nullish(),
  title: line(200).pipe(z.string().min(1)).optional(),
  organization: line(160).optional(),
  applicationUrl: z.union([httpsUrl, z.literal('')]).optional(),
  status: z.enum(APPLICATION_STATUSES).default('interested'),
  notes: text(4000).optional(),
  deadline: optionalDate,
  nextAction: line(300).optional(),
  nextActionDue: optionalDate,
  appliedAt: optionalDate,
}).refine((v) => v.opportunityId || v.title, { message: 'Provide an opportunityId or a title', path: ['title'] });

export const applicationPatchSchema = z.object({
  title: line(200).pipe(z.string().min(1)).optional(),
  organization: line(160).optional(),
  applicationUrl: z.union([httpsUrl, z.literal('')]).optional(),
  status: z.enum(APPLICATION_STATUSES).optional(),
  notes: text(4000).optional(),
  deadline: optionalDate,
  nextAction: z.union([line(300), z.null()]).optional(),
  nextActionDue: optionalDate,
  appliedAt: optionalDate,
  archived: z.boolean().optional(),
});

export const applicationQuerySchema = z.object({
  archived: z.enum(['true', 'false']).transform((v) => v === 'true').default('false'),
  status: z.enum(APPLICATION_STATUSES).optional(),
});

// ---- Roadmap ------------------------------------------------------------

export const roadmapGenerateSchema = z.object({
  goal: str(300).min(3, 'Describe your goal in a few words'),
  opportunityId: objectId.nullish(),
});

export const milestonePatchSchema = z.object({
  status: z.enum(MILESTONE_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  order: z.number().int().min(0).max(1000).optional(),
  targetDate: optionalDate,
  title: line(160).pipe(z.string().min(1)).optional(),
});

export const milestoneCreateSchema = z.object({
  goal: line(300).pipe(z.string().min(3)).optional(),
  title: line(160).pipe(z.string().min(1)),
  purpose: text(600).optional(),
  steps: z.array(str(300).min(1)).max(15).default([]),
  skills: tagList(10, 40).default([]),
  priority: z.enum(PRIORITIES).default('medium'),
  targetDate: optionalDate,
});

export const milestoneParams = z.object({ milestoneId: objectId });

// ---- AI -----------------------------------------------------------------

export const chatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: str(4000).min(1),
  })).min(1).max(30),
  contextOpportunityId: objectId.nullish(),
});

export const quickSchema = z.object({ message: str(500).min(1) });

export const draftEmailSchema = z.object({
  opportunityId: objectId,
  recipientName: str(100).optional(),
  tone: z.enum(['formal', 'warm', 'concise']).default('formal'),
  extraContext: str(600).optional(),
});

export const resumeSchema = z.object({
  kind: z.enum(['resume', 'cover_letter', 'resume_summary']),
  opportunityId: objectId.nullish(),
  extraContext: str(600).optional(),
});

export const draftPatchSchema = z.object({
  title: str(200).optional(),
  subject: str(300).optional(),
  body: z.string().min(1).max(20000).optional(),
  markReviewed: z.boolean().optional(),
});

export const draftCreateSchema = z.object({
  kind: z.enum(DRAFT_KINDS),
  opportunityId: objectId.nullish(),
  title: str(200).optional(),
  subject: str(300).optional(),
  body: z.string().min(1).max(20000),
});

// ---- Admin --------------------------------------------------------------

const moneyInput = z.object({
  amount: z.union([z.number().min(0), z.null()]).optional(),
  currency: z.string().length(3).default('INR'),
  period: z.union([z.enum(['per_year', 'per_month', 'one_time', 'total']), z.null()]).optional(),
  description: str(500).optional(),
});

const ruleInput = z.object({
  key: z.string().trim().regex(/^[a-z0-9_]{1,60}$/, 'Use lowercase letters, numbers and underscores'),
  kind: z.enum(RULE_KINDS),
  label: str(300).min(1),
  mandatory: z.boolean().default(true),
  values: z.array(str(80)).max(40).default([]),
  numberValue: z.number().optional(),
  sourceExcerpt: str(600).optional(),
  note: str(400).optional(),
  restrictsAudience: z.boolean().default(false),
});

const opportunityFields = {
  title: str(200).min(3),
  organization: str(160).min(2),
  opportunityType: z.enum(OPPORTUNITY_TYPES),
  officialDescription: str(4000).optional(),
  summary: str(1500).optional(),
  sourceUrl: httpsUrl,
  applicationUrl: z.union([httpsUrl, z.literal('')]).optional(),
  sourceType: z.enum(SOURCE_TYPES).default('college_admin'),
  declaredStatus: z.enum(DECLARED_STATUSES).default('unknown'),
  applicationOpensAt: optionalDate,
  deadline: optionalDate,
  deadlineNote: str(300).optional(),
  eligibleDegrees: tagList(20, 60).default([]),
  eligibleYears: z.array(z.number().int().min(1).max(6)).max(6).default([]),
  eligibleBranches: tagList(30, 80).default([]),
  requiredSkills: tagList(20, 40).default([]),
  preferredSkills: tagList(20, 40).default([]),
  minimumCGPA: z.union([z.number().min(0).max(10), z.null()]).optional(),
  location: z.object({
    city: str(60).optional(),
    state: str(60).optional(),
    country: str(60).optional(),
    isNationwide: z.boolean().optional(),
    description: str(200).optional(),
  }).optional(),
  workMode: z.enum(OPP_WORK_MODES).default('unknown'),
  award: moneyInput.nullable().optional(),
  stipend: moneyInput.nullable().optional(),
  duration: str(120).optional(),
  eligibilityRules: z.array(ruleInput).max(30).default([]),
  requiredDocuments: z.array(str(200).min(1)).max(30).default([]),
  tags: tagList(20, 40).default([]),
  collegeId: z.union([objectId, z.null()]).optional(),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
};

export const adminOpportunityCreateSchema = z.object(opportunityFields);
// A PATCH changes only the fields it sends: defaults (status 'draft', sourceType, empty lists…) must not
// be filled in, or every edit would silently unpublish the listing and wipe its criteria.
export const adminOpportunityPatchSchema = z.object(
  Object.fromEntries(Object.entries(opportunityFields).map(([k, v]) => [k, (v instanceof z.ZodDefault ? v.removeDefault() : v).optional()])),
);

export const adminVerifySchema = z.object({
  sourceConfirmed: z.literal(true, { message: 'Confirm you checked the official source' }),
  notes: str(1000).optional(),
});

export const announcementCreateSchema = z.object({
  collegeId: objectId,
  title: line(160).pipe(z.string().min(3)),
  body: text(5000).pipe(z.string().min(3)),
  category: z.enum(ANNOUNCEMENT_CATEGORIES).default('general'),
  sourceUrl: z.union([httpsUrl, z.literal('')]).optional(),
  linkedOpportunityId: objectId.optional(),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  expiresAt: optionalDate,
});

export const announcementPatchSchema = z.object({
  title: str(160).min(3).optional(),
  body: str(5000).min(3).optional(),
  category: z.enum(ANNOUNCEMENT_CATEGORIES).optional(),
  sourceUrl: z.union([httpsUrl, z.literal('')]).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  expiresAt: optionalDate,
});

export const collegeQuerySchema = z.object({ q: str(80).optional() });
