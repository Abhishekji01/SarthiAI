// Types mirror the JSON returned by the SarthiAI API (server/src/models/*.js serializers).

export type OpportunityType = 'internship' | 'scholarship' | 'fellowship' | 'research' | 'competition' | 'hackathon' | 'job' | 'program';
export const OPPORTUNITY_TYPES: OpportunityType[] = ['internship', 'scholarship', 'fellowship', 'research', 'competition', 'hackathon', 'job', 'program'];
export type Availability = 'open' | 'closed' | 'upcoming' | 'unknown';
export type EligibilityOverall = 'all_criteria_met' | 'missing_information' | 'likely_ineligible' | 'insufficient_source_info';

export interface Money { amount: number | null; currency: string; period: 'per_year' | 'per_month' | 'one_time' | 'total' | null; description?: string }
export interface MatchFactor { factor: string; positive: boolean; detail: string }
export interface Match {
  score: number;
  scoreLabel: string;
  confidence?: 'high' | 'medium' | 'low';
  eligibilityOverall: EligibilityOverall;
  hardBlocked: boolean;
  audienceRestricted: boolean;
  confirmedFit: boolean;
  factors: MatchFactor[];
}
export interface EligibilityRule {
  key: string; kind: string; label: string; mandatory: boolean; values: string[]; numberValue: number | null;
  sourceExcerpt: string | null; note: string | null; restrictsAudience: boolean;
}
export interface Opportunity {
  /** Set when an in-person listing is in the student's city or state. */
  nearby?: 'city' | 'state' | null;
  id: string;
  title: string;
  organization: string;
  opportunityType: OpportunityType;
  officialDescription: string | null;
  summary: string | null;
  summarySource: 'editor' | 'ai' | null;
  sourceUrl: string;
  applicationUrl: string | null;
  additionalSources: { label: string; url: string }[];
  sourceType: string;
  verificationStatus: 'verified' | 'pending' | 'needs_review' | 'unverified';
  lastVerifiedAt: string | null;
  datesRefreshedAt: string | null;
  verificationNotes: string | null;
  isStale: boolean;
  availability: Availability;
  applicationOpensAt: string | null;
  deadline: string | null;
  deadlineNote: string | null;
  eligibleDegrees: string[];
  eligibleYears: number[];
  eligibleBranches: string[];
  requiredSkills: string[];
  preferredSkills: string[];
  minimumCGPA: number | null;
  location: { city?: string; state?: string; country?: string; isNationwide?: boolean; description?: string } | null;
  workMode: 'remote' | 'hybrid' | 'onsite' | 'not_applicable' | 'unknown';
  award: Money | null;
  stipend: Money | null;
  duration: string | null;
  eligibilityRules: EligibilityRule[];
  requiredDocuments: string[];
  tags: string[];
  collegeId: string | null;
  status: 'draft' | 'published' | 'archived';
  updatedAt: string;
  match?: Match;
  watchingDates?: boolean;
  createdAt?: string;
  isSaved?: boolean;
  tracked?: { id: string; status: ApplicationStatus; archived: boolean } | null;
  tier?: 'recommended' | 'possible';
  searchMatch?: { relevance: number; matchedTerms: string[]; approximate: boolean };
}

export interface PageMeta { page: number; limit: number; total: number; totalPages: number; excludedLikelyIneligible?: number; nearby?: { places: string[]; count: number }; search?: { relaxed: boolean; terms: string[]; closedMatches?: number; hiddenMentions?: number } }

export interface Criterion {
  key: string; kind: string; requirement: string; mandatory: boolean; studentValue: string | null;
  status: 'met' | 'unmet' | 'unknown'; explanation: string; nextStep: string | null; sourceExcerpt: string | null; restrictsAudience: boolean;
}
export interface EligibilityResult {
  opportunityId: string;
  overall: EligibilityOverall;
  counts: { met: number; unmet: number; unknown: number };
  criteria: Criterion[];
  caveats: { code: string; message: string }[];
  availability: Availability;
  disclaimer: string;
  checkedAt: string;
}

export interface Project { _id?: string; title: string; description?: string; skills?: string[]; url?: string }
export interface Profile {
  collegeId: string | null;
  collegeName?: string;
  degree?: string;
  branch?: string;
  currentYear?: number;
  semester?: number;
  graduationYear?: number;
  cgpa?: number;
  skills?: string[];
  interests?: string[];
  careerGoal?: string;
  headline?: string;
  projects?: Project[];
  achievements?: string[];
  preferredLocations?: string[];
  workModes?: ('remote' | 'hybrid' | 'onsite')[];
  homeState?: string;
  annualFamilyIncomeINR?: number;
  gender?: 'female' | 'male' | 'other';
  socialCategory?: 'general' | 'obc' | 'sc' | 'st' | 'ews';
  disability?: boolean;
  minority?: boolean;
  parentService?: 'none' | 'capf' | 'railways' | 'defence' | 'state_police';
  firstGeneration?: boolean;
  links?: { github?: string; linkedin?: string; portfolio?: string };
}
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'college_admin' | 'platform_admin';
  adminCollegeIds: string[];
  profile: Profile;
  notificationPrefs: { deadlineReminders: boolean; reminderDaysBefore: number; campusAnnouncements: boolean; emailDeadlines?: boolean; emailDigest?: boolean };
  onboardingCompletedAt: string | null;
  emailVerified?: boolean;
  createdAt: string;
}

export interface College { id: string; name: string; shortName: string | null; city: string | null; state: string | null; website: string | null; listed: boolean }

export type ApplicationStatus = 'interested' | 'preparing' | 'ready_to_apply' | 'applied' | 'assessment' | 'interview' | 'offer' | 'rejected' | 'withdrawn';
export const APPLICATION_STATUSES: ApplicationStatus[] = ['interested', 'preparing', 'ready_to_apply', 'applied', 'assessment', 'interview', 'offer', 'rejected', 'withdrawn'];
export interface Application {
  id: string;
  opportunityId: string | null;
  title: string;
  organization: string | null;
  applicationUrl: string | null;
  status: ApplicationStatus;
  statusHistory: { status: ApplicationStatus; at: string }[];
  notes: string;
  appliedAt: string | null;
  deadline: string | null;
  nextAction: string | null;
  nextActionDue: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Resource { id: string; title: string; provider: string; url: string; skills: string[]; cost: string; description: string | null }
export type MilestoneStatus = 'not_started' | 'in_progress' | 'paused' | 'completed';
export interface Milestone {
  id: string; title: string; purpose: string | null; steps: string[]; skills: string[]; effortEstimate: string | null;
  priority: 'high' | 'medium' | 'low'; order: number; prerequisites: string[]; verifiedResources: Resource[];
  suggestedResources: { title: string; note: string | null }[]; projectIdeas: string[]; targetDate: string | null;
  status: MilestoneStatus; completedAt: string | null; source: 'ai' | 'student' | 'plan';
}
export interface Roadmap {
  id: string; goal: string; summary: string | null; generatedBy: 'ai' | 'student'; targetOpportunityId: string | null;
  progress: { completed: number; total: number }; milestones: Milestone[];
}

export type DraftKind = 'email' | 'cover_letter' | 'resume' | 'resume_summary';
export interface Draft {
  id: string; opportunityId: string | null; kind: DraftKind; title: string | null; subject: string | null; body: string;
  generatedBy: 'ai' | 'student'; missingInformation: string[]; reviewedAt: string | null; createdAt: string; updatedAt: string;
}

export interface NextMove {
  kind: string; title: string; detail: string; reason: string; dueAt: string | null;
  target: { type: 'profile' | 'application' | 'opportunity' | 'milestone' | 'roadmap'; id: string | null };
}
export interface DeadlineItem {
  kind: 'application_deadline' | 'next_action' | 'saved_deadline'; date: string; title: string; organization: string | null;
  applicationId: string | null; opportunityId: string | null; overdue?: boolean; status?: string; verified?: boolean;
}

export interface Announcement {
  id: string; collegeId: string; collegeName: string | null; title: string; body: string; category: string; sourceUrl: string | null;
  linkedOpportunityId: string | null; status: 'draft' | 'published' | 'archived'; publishedAt: string | null; expiresAt: string | null; publisherName: string | null;
}

export interface ProposedAction {
  id: string; type: 'save_opportunity' | 'track_application' | 'draft_email' | 'generate_roadmap';
  opportunityId: string | null; title: string | null; label: string; nextAction: string | null; goal: string | null;
}
export interface ChatReply {
  reply: string;
  citations: { opportunityId: string; title: string; sourceUrl: string; verificationStatus: string }[];
  proposedActions: ProposedAction[];
  toolsUsed: string[];
  grounding?: { status: 'verified' | 'corrected' | 'unverified'; unverifiedClaims: string[] };
  model: string;
}

export interface AdminMetrics {
  generatedAt: string; note: string;
  studentsOnSarthi: { count: number | null; suppressed: boolean };
  announcements: Record<string, number>;
  listings: { opportunityId: string; title: string; status: string; verificationStatus: string; saves: { count: number | null; suppressed: boolean }; tracked: { count: number | null; suppressed: boolean } }[];
}

export interface PlanOpportunity {
  id: string; title: string; organization: string; opportunityType: OpportunityType; deadline: string | null;
  daysLeft: number | null; matchScore: number; fitsGoal: boolean; required?: boolean;
}
export interface PlanSkill {
  id: string; label: string; unlocks: number; required: number; strengthens: number; fitsGoal: number;
  nearestDeadline: string | null; effortWeeks: number; opportunities: PlanOpportunity[]; resources: Resource[];
}
export interface PlanStep {
  kind: 'profile' | 'skill' | 'experience'; title: string; detail: string; weeks: number | null; skillId?: string;
  effortEstimate?: string; startsAt: string | null; targetDate: string | null; resources?: Resource[]; applyTo?: PlanOpportunity[];
}
export interface GapPlan {
  generatedAt: string; horizonDays: number; headline: string; note: string;
  summary: { considered: number; readyNow: number; notFixable: number; roleMismatch: number; restricted: number; closed: number; unlockable: number; plannedUnlocks: number };
  quickWins: { field: string; label: string; count: number; examples: PlanOpportunity[] }[];
  skills: PlanSkill[]; experience: PlanOpportunity[]; steps: PlanStep[];
}

/** GET /opportunities/summary: open listings per type (Find's default filter) with the eligibility split. */
export interface TypeSummary { open: number; likelyEligible: number; needDetails: number; likelyIneligible: number; closingIn30Days: number }
export interface OpenSummary { types: Record<OpportunityType, TypeSummary> }

export interface SavedSearch { id: string; name: string; params: Record<string, string>; query: string; alerts: boolean; createdAt: string }
