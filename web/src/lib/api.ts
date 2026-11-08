import { isNative, storage } from './platform';
import type {
  AdminMetrics, Announcement, Application, ChatReply, College, DeadlineItem, Draft, DraftKind, EligibilityResult, GapPlan,
  ChecklistItem, DocumentVault, NextMove, OpenSummary, Opportunity, PageMeta, Profile, Resource, ResumeSuggestions, Roadmap, SavedSearch, User, VaultDocument,
} from './types';

import { buildFlags, resolveBaseUrl, shouldAttachToken, trimUrl } from './serverConfig';

/**
 * API base URL:
 *  - browser build served by the SarthiAI server: same origin ('')
 *  - Android app: VITE_API_BASE_URL at build time
 *  - dev builds only: a custom server set in Profile ▸ Developer (see serverConfig.ts).
 *    The Android emulator reaches a dev server on your computer at http://10.0.2.2:4000.
 */
const SERVER_KEY = 'sarthi.serverUrl';
const TOKEN_KEY = 'sarthi.token';
const BUILD_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') ?? '';
export const DEFAULT_SERVER_URL = BUILD_URL || (isNative ? 'http://10.0.2.2:4000' : '');
export const serverOverrideAllowed = buildFlags.overrideAllowed;

let baseUrl = DEFAULT_SERVER_URL;
let token: string | null = null;
/** True once the app knows it is signed in; only then does a 401 mean "session expired". */
let active = false;
export const markSessionActive = (v: boolean) => { active = v; };

/**
 * The web app keeps its session in an httpOnly cookie set by the server (page
 * scripts cannot read it). The Android app, and dev builds pointed at another
 * server, use a bearer token kept in app storage.
 */
export const usesCookieSession = () => !isNative && !usingCustomServer();

export async function loadClientState() {
  const { baseUrl: resolved, clearStored } = resolveBaseUrl(await storage.get(SERVER_KEY), DEFAULT_SERVER_URL);
  // A stale or disallowed override (e.g. saved by an older version) is removed so the app recovers by itself.
  if (clearStored) await storage.set(SERVER_KEY, null);
  baseUrl = resolved;
  token = await storage.get(TOKEN_KEY);
  // Web: a token left in localStorage by an older version is moved into the cookie, then deleted.
  const legacyToken = usesCookieSession() && Boolean(token);
  return { hasToken: Boolean(token) || usesCookieSession(), legacyToken, baseUrl };
}
export const getServerUrl = () => baseUrl;
/** True while a developer server override is in effect. */
export const usingCustomServer = () => baseUrl !== DEFAULT_SERVER_URL;
export async function setServerUrl(url: string) {
  if (!serverOverrideAllowed) return;
  baseUrl = trimUrl(url) || DEFAULT_SERVER_URL;
  await storage.set(SERVER_KEY, baseUrl === DEFAULT_SERVER_URL ? null : baseUrl);
}
/** Clears any custom server and reloads the app on the default one. */
export async function resetServerUrl(reload: () => void = () => window.location.reload()) {
  baseUrl = DEFAULT_SERVER_URL;
  await storage.set(SERVER_KEY, null);
  reload();
}
/** Checks a server before it is saved. Never sends the session token. */
export async function probeServer(url: string) {
  try {
    const res = await fetch(`${trimUrl(url)}/health`, { credentials: 'omit' });
    if (!res.ok) return false;
    const body = await res.json().catch(() => null);
    return body?.status === 'ok';
  } catch {
    return false;
  }
}
export async function setToken(t: string | null) {
  token = t;
  await storage.set(TOKEN_KEY, t);
}

/** Session headers for requests made outside request() (files). */
function authHeaders(): Record<string, string> {
  return { ...(usesCookieSession() ? { 'X-Sarthi-Client': 'web' } : {}), ...(token && shouldAttachToken(baseUrl, DEFAULT_SERVER_URL) ? { Authorization: `Bearer ${token}` } : {}) };
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
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(usesCookieSession() ? { 'X-Sarthi-Client': 'web' } : {}),
        ...(token && shouldAttachToken(baseUrl, DEFAULT_SERVER_URL) ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: usesCookieSession() ? 'same-origin' : 'omit',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', navigator.onLine === false ? 'You are offline. Check your connection and try again.' : usingCustomServer() ? `Cannot reach the SarthiAI server at ${baseUrl}. Check your connection, or reset to the default server.` : 'Cannot reach the SarthiAI server. Check your connection and try again.');
  }
  let json: any = null;
  try { json = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = json?.error ?? {};
    if (res.status === 401 && active) sessionEvents.dispatchEvent(new Event('expired'));
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
  campusOnly?: boolean; mentions?: boolean; deadlineWithinDays?: number; hasPrize?: boolean; sort?: 'relevance' | 'deadline' | 'recent' | 'nearby'; page?: number; limit?: number;
  minAnnualAmount?: number; hideIneligible?: boolean;
}
export type ProfilePatch = { name?: string; profile?: Partial<Profile> & { customCollegeName?: string }; notificationPrefs?: Partial<User['notificationPrefs']>; completeOnboarding?: boolean };

export const api = {
  health: () => fetch(`${baseUrl}/health`).then((r) => r.ok).catch(() => false),

  register: (b: { name: string; email: string; password: string }) => post<{ token: string | null; user: User }>('/auth/register', b),
  login: (b: { email: string; password: string }) => post<{ token: string | null; user: User }>('/auth/login', b),
  upgradeSession: () => post<{ session: 'cookie' }>('/auth/session'),
  logout: () => post<{ signedOut: boolean }>('/auth/logout'),
  logoutAll: () => post<{ signedOut: boolean }>('/auth/logout-all'),
  authConfig: () => get<{ googleSignIn: boolean; emailDelivery: boolean }>('/auth/config'),
  verifyEmail: (token: string) => post<{ verified: boolean; email: string }>('/auth/verify-email', { token }),
  resendVerification: () => post<{ sent: boolean; alreadyVerified: boolean }>('/auth/verify-email/resend'),
  forgotPassword: (email: string) => post<{ sent: boolean; message: string }>('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) => post<{ reset: boolean; token: string | null; user: User }>('/auth/reset-password', { token, password }),
  me: () => get<{ user: User }>('/auth/me').then((d) => d.user),

  updateProfile: (b: ProfilePatch) => patch<{ user: User }>('/profile', b).then((d) => d.user),
  deleteAccount: (password: string) => del<{ deleted: boolean }>('/profile', { password }),
  colleges: (q?: string) => get<College[]>('/colleges', { q }),

  opportunities: (q: OpportunityQuery) => getWithMeta<Opportunity[]>('/opportunities', q as Query) as Promise<{ data: Opportunity[]; meta: PageMeta }>,
  openSummary: () => get<OpenSummary>('/opportunities/summary'),
  eventPlaces: (type: string) => get<{ city: string; count: number }[]>(`/opportunities/places?type=${encodeURIComponent(type)}`),
  opportunity: (id: string) => get<Opportunity>(`/opportunities/${id}`),
  /** Public facts only (no sign-in): for shared links. */
  publicOpportunity: (id: string) => get<Opportunity>(`/public/opportunities/${id}`),
  save: (id: string) => post(`/opportunities/${id}/save`),
  watchDates: (id: string) => post<{ watchingDates: boolean; isSaved: boolean }>(`/opportunities/${id}/watch`),
  unwatchDates: (id: string) => del<{ watchingDates: boolean }>(`/opportunities/${id}/watch`),
  /** The deadline as an .ics calendar file (text). */
  calendarIcs: async (id: string) => {
    const res = await fetch(`${baseUrl}/api/opportunities/${id}/calendar.ics`, { headers: authHeaders(), credentials: usesCookieSession() ? 'same-origin' : 'omit' });
    if (!res.ok) throw new ApiError(res.status, `HTTP_${res.status}`, 'Could not create the calendar file.');
    return res.text();
  },
  publicCalendarUrl: (id: string) => `${baseUrl || window.location.origin}/api/public/opportunities/${id}/calendar.ics`,
  unsave: (id: string) => del(`/opportunities/${id}/save`),
  saved: () => get<Opportunity[]>('/saved'),
  matches: (q: { limit?: number; tier?: 'recommended' | 'all' } = {}) => getWithMeta<Opportunity[]>('/matches', q),
  checkEligibility: (opportunityId: string, declarations?: Record<string, boolean>) => post<EligibilityResult & { savedAnswers?: Record<string, boolean> }>('/eligibility/check', { opportunityId, declarations }),
  saveAnswer: (opportunityId: string, key: string, answer: boolean | null) => request<unknown>('PUT', '/eligibility/answers', { body: { opportunityId, key, answer } }),
  clearAnswers: (opportunityId?: string) => request<{ cleared: number }>('DELETE', '/eligibility/answers', { query: { opportunityId } }).then((r) => r.data),

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

  /** Reads a resume PDF and returns suggestions; nothing is saved. */
  parseResume: async (file: File) => {
    const res = await fetch(`${baseUrl}/api/profile/resume`, { method: 'POST', body: file, headers: { 'Content-Type': 'application/pdf', ...authHeaders() }, credentials: usesCookieSession() ? 'same-origin' : 'omit' });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? `HTTP_${res.status}`, res.status === 413 ? 'That PDF is larger than 2 MB.' : json?.error?.message ?? 'Could not read the resume.');
    return json.data.suggestions as ResumeSuggestions;
  },
  documents: () => get<DocumentVault>('/documents'),
  opportunityDocuments: (id: string) => get<ChecklistItem[]>(`/opportunities/${id}/documents`),
  setDocumentHave: (kind: string, have: boolean) => request<{ have: string[] }>('PUT', '/documents/have', { body: { kind, have } }).then((r) => r.data),
  documentLink: (id: string) => post<{ url: string; expiresInSeconds: number }>(`/documents/${id}/link`).then((r) => ({ ...r, url: `${baseUrl}${r.url}` })),
  deleteDocument: (id: string) => del(`/documents/${id}`),
  uploadDocument: async (kind: string, file: File) => {
    const res = await fetch(`${baseUrl}/api/documents?${new URLSearchParams({ kind, name: file.name })}`, {
      method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream', ...authHeaders() }, credentials: usesCookieSession() ? 'same-origin' : 'omit',
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? `HTTP_${res.status}`, res.status === 413 ? 'That file is larger than 4 MB.' : json?.error?.message ?? 'Upload failed.');
    return json.data as VaultDocument;
  },

  searches: () => get<SavedSearch[]>('/searches'),
  saveSearch: (b: { name: string; params: Record<string, string>; alerts: boolean }) => post<SavedSearch>('/searches', b),
  updateSearch: (id: string, b: { name?: string; alerts?: boolean }) => patch<SavedSearch>(`/searches/${id}`, b),
  deleteSearch: (id: string) => del(`/searches/${id}`),
  searchCount: (id: string) => get<{ total: number }>(`/searches/${id}/count`),

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
