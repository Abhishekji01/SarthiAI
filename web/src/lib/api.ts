import { isNative, storage } from './platform';
import type {
  AdminMetrics, Announcement, Application, ChatReply, College, DeadlineItem, Draft, DraftKind, EligibilityResult, GapPlan,
  NextMove, Opportunity, PageMeta, Profile, Resource, Roadmap, User,
} from './types';

/**
 * API base URL:
 *  - browser build served by the SarthiAI server: same origin ('')
 *  - Android app: VITE_API_BASE_URL at build time, or the URL set in Profile ▸ Developer
 *    (Android emulator reaches a dev server on your computer at http://10.0.2.2:4000)
 */
const SERVER_KEY = 'sarthi.serverUrl';
const TOKEN_KEY = 'sarthi.token';
const BUILD_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') ?? '';
export const DEFAULT_SERVER_URL = BUILD_URL || (isNative ? 'http://10.0.2.2:4000' : '');

let baseUrl = DEFAULT_SERVER_URL;
let token: string | null = null;

export async function loadClientState() {
  baseUrl = ((await storage.get(SERVER_KEY)) ?? DEFAULT_SERVER_URL).replace(/\/+$/, '');
  token = await storage.get(TOKEN_KEY);
  return { hasToken: Boolean(token), baseUrl };
}
export const getServerUrl = () => baseUrl;
export async function setServerUrl(url: string) {
  baseUrl = url.trim().replace(/\/+$/, '');
  await storage.set(SERVER_KEY, baseUrl === DEFAULT_SERVER_URL ? null : baseUrl);
}
export async function setToken(t: string | null) {
  token = t;
  await storage.set(TOKEN_KEY, t);
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
  get isAIUnavailable() { return ['AI_UNAVAILABLE', 'AI_BUSY', 'AI_TIMEOUT', 'AI_INVALID_OUTPUT'].includes(this.code) || this.status === 503; }
}

/** Fired when the server rejects the token (expired or signed out elsewhere). */
export const sessionEvents = new EventTarget();

type Query = Record<string, string | number | boolean | undefined | null>;

async function request<T>(method: string, path: string, { body, query }: { body?: unknown; query?: Query } = {}): Promise<{ data: T; meta?: any }> {
  const qs = query
    ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString()}`
    : '';
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api${path}${qs === '?' ? '' : qs}`, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', navigator.onLine === false ? 'You are offline. Check your connection and try again.' : `Cannot reach the SarthiAI server${baseUrl ? ` at ${baseUrl}` : ''}. Check your connection or the server URL in Profile ▸ Developer.`);
  }
  let json: any = null;
  try { json = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = json?.error ?? {};
    if (res.status === 401 && token) sessionEvents.dispatchEvent(new Event('expired'));
    throw new ApiError(res.status, err.code ?? `HTTP_${res.status}`, err.message ?? 'Something went wrong. Please try again.', err.details);
  }
  return json ?? { data: null };
}

const get = <T>(path: string, query?: Query) => request<T>('GET', path, { query }).then((r) => r.data);
const getWithMeta = <T>(path: string, query?: Query) => request<T>('GET', path, { query });
const post = <T>(path: string, body?: unknown) => request<T>('POST', path, { body: body ?? {} }).then((r) => r.data);
const patch = <T>(path: string, body: unknown) => request<T>('PATCH', path, { body }).then((r) => r.data);
const del = <T>(path: string, body?: unknown) => request<T>('DELETE', path, { body }).then((r) => r.data);

export interface OpportunityQuery {
  q?: string; type?: string; workMode?: string; location?: string; verifiedOnly?: boolean; includeClosed?: boolean;
  campusOnly?: boolean; mentions?: boolean; deadlineWithinDays?: number; sort?: 'relevance' | 'deadline' | 'recent'; page?: number; limit?: number;
}
export type ProfilePatch = { name?: string; profile?: Partial<Profile> & { customCollegeName?: string }; notificationPrefs?: Partial<User['notificationPrefs']>; completeOnboarding?: boolean };

export const api = {
  health: () => fetch(`${baseUrl}/health`).then((r) => r.ok).catch(() => false),

  register: (b: { name: string; email: string; password: string }) => post<{ token: string; user: User }>('/auth/register', b),
  login: (b: { email: string; password: string }) => post<{ token: string; user: User }>('/auth/login', b),
  logout: () => post<{ signedOut: boolean }>('/auth/logout'),
  me: () => get<{ user: User }>('/auth/me').then((d) => d.user),

  updateProfile: (b: ProfilePatch) => patch<{ user: User }>('/profile', b).then((d) => d.user),
  deleteAccount: (password: string) => del<{ deleted: boolean }>('/profile', { password }),
  colleges: (q?: string) => get<College[]>('/colleges', { q }),

  opportunities: (q: OpportunityQuery) => getWithMeta<Opportunity[]>('/opportunities', q as Query) as Promise<{ data: Opportunity[]; meta: PageMeta }>,
  opportunity: (id: string) => get<Opportunity>(`/opportunities/${id}`),
  save: (id: string) => post(`/opportunities/${id}/save`),
  unsave: (id: string) => del(`/opportunities/${id}/save`),
  saved: () => get<Opportunity[]>('/saved'),
  matches: (q: { limit?: number; tier?: 'recommended' | 'all' } = {}) => getWithMeta<Opportunity[]>('/matches', q),
  checkEligibility: (opportunityId: string, declarations?: Record<string, boolean>) => post<EligibilityResult>('/eligibility/check', { opportunityId, declarations }),

  applications: (archived = false) => get<Application[]>('/applications', { archived }),
  createApplication: (b: Partial<Application> & { opportunityId?: string | null }) => post<Application>('/applications', b),
  updateApplication: (id: string, b: Partial<Application>) => patch<Application>(`/applications/${id}`, b),
  deleteApplication: (id: string) => del(`/applications/${id}`),

  roadmap: () => get<Roadmap | null>('/roadmap'),
  addMilestone: (b: { title: string; purpose?: string; steps?: string[]; priority?: string; targetDate?: string | null; goal?: string }) => post<Roadmap>('/roadmap/milestones', b),
  updateMilestone: (id: string, b: Record<string, unknown>) => patch<Roadmap>(`/roadmap/milestones/${id}`, b),
  deleteMilestone: (id: string) => del<Roadmap>(`/roadmap/milestones/${id}`),

  drafts: (opportunityId?: string) => get<Draft[]>('/drafts', { opportunityId }),
  draft: (id: string) => get<Draft>(`/drafts/${id}`),
  createDraft: (b: { kind: DraftKind; body: string; title?: string; subject?: string; opportunityId?: string | null }) => post<Draft>('/drafts', b),
  updateDraft: (id: string, b: { title?: string; subject?: string; body?: string; markReviewed?: boolean }) => patch<Draft>(`/drafts/${id}`, b),
  deleteDraft: (id: string) => del(`/drafts/${id}`),

  aiStatus: () => get<{ available: boolean; model: string | null; quickAnswers?: boolean }>('/ai/status'),
  chat: (messages: { role: 'user' | 'assistant'; content: string }[], contextOpportunityId?: string) => post<ChatReply>('/ai/chat', { messages, contextOpportunityId }),
  quick: (message: string) => post<ChatReply>('/ai/quick', { message }),
  generateRoadmap: (goal: string, opportunityId?: string | null) => post<Roadmap>('/ai/roadmap', { goal, opportunityId }),
  draftEmail: (b: { opportunityId: string; tone?: string; recipientName?: string; extraContext?: string }) => post<Draft>('/ai/draft-email', b),
  generateResume: (b: { kind: 'resume' | 'cover_letter' | 'resume_summary'; opportunityId?: string | null; extraContext?: string }) => post<Draft>('/ai/resume', b),
  explainMatch: (id: string) => post<{ explanation: string; nextSteps: string[] }>(`/ai/explain-match/${id}`),

  announcements: () => get<Announcement[]>('/campus/announcements'),
  nextMoves: () => get<NextMove[]>('/me/next-moves'),
  plan: () => get<GapPlan>('/me/plan'),
  addPlanToRoadmap: () => post<{ added: number; roadmap: Roadmap }>('/me/plan/roadmap'),
  deadlines: () => get<DeadlineItem[]>('/me/deadlines'),
  resources: () => get<Resource[]>('/resources'),

  admin: {
    colleges: () => get<College[]>('/admin/colleges'),
    opportunities: () => get<Opportunity[]>('/admin/opportunities'),
    createOpportunity: (b: Record<string, unknown>) => post<Opportunity>('/admin/opportunities', b),
    updateOpportunity: (id: string, b: Record<string, unknown>) => patch<Opportunity>(`/admin/opportunities/${id}`, b),
    verify: (id: string, notes?: string) => post<Opportunity>(`/admin/opportunities/${id}/verify`, { sourceConfirmed: true, notes }),
    announcements: () => get<Announcement[]>('/admin/announcements'),
    createAnnouncement: (b: Record<string, unknown>) => post<Announcement>('/admin/announcements', b),
    updateAnnouncement: (id: string, b: Record<string, unknown>) => patch<Announcement>(`/admin/announcements/${id}`, b),
    metrics: () => get<AdminMetrics>('/admin/metrics'),
  },
};
