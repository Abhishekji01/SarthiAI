import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Opportunity } from '../models/Opportunity.js';
import { SavedOpportunity } from '../models/SavedOpportunity.js';
import { Application } from '../models/Application.js';
import { DateWatch } from '../models/Notification.js';
import { getDeadlines } from '../services/nextMoves.js';
import { recommendedMatches, searchOpportunities } from '../services/opportunities.js';
import { SavedSearch } from '../models/SavedSearch.js';
import { searchQueryFromParams } from '../validators/schemas.js';
import { calendarDaysUntil } from '../utils/dates.js';
import { appUrl, simpleEmail } from '../mail/mailer.js';
import { sendOnce } from './channels.js';
import { logger } from '../utils/logger.js';

const IST = 5.5 * 3600000;
const fmt = (d) => new Date(new Date(d).getTime() + IST).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const istDay = (d) => new Date(new Date(d).getTime() + IST).toISOString().slice(0, 10);

/** ISO week label in India time, e.g. "2026-W46". */
export function isoWeek(now = new Date()) {
  const d = new Date(new Date(now).getTime() + IST);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - yearStart) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}

/** One-click unsubscribe link (signed; no sign-in needed). */
export function unsubscribeUrl(user, kind) {
  const token = jwt.sign({ purpose: 'unsubscribe', kind }, env.JWT_SECRET, { subject: String(user._id), expiresIn: '180d', algorithm: 'HS256' });
  return `${appUrl()}/api/public/unsubscribe?token=${encodeURIComponent(token)}`;
}

const emailable = { emailVerifiedAt: { $ne: null } };

/** "<title> closes in N days" for saved or tracked deadlines, N = the student's reminder setting. */
export async function runDeadlineReminders(now = new Date()) {
  const ids = new Set([
    ...(await SavedOpportunity.distinct('userId')).map(String),
    ...(await Application.distinct('userId', { archived: false })).map(String),
  ]);
  const users = await User.find({ _id: { $in: [...ids] }, ...emailable, 'notificationPrefs.deadlineReminders': { $ne: false }, 'notificationPrefs.emailDeadlines': { $ne: false } });
  let sent = 0;
  for (const user of users) {
    const before = user.notificationPrefs?.reminderDaysBefore ?? 3;
    const due = (await getDeadlines(user, { now, horizonDays: 31 }))
      .filter((d) => d.kind !== 'next_action' && !d.overdue)
      .filter((d) => { const n = calendarDaysUntil(d.date, now); return n >= 0 && n <= before; });
    for (const d of due) {
      const n = calendarDaysUntil(d.date, now);
      const when = n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days (${fmt(d.date)})`;
      const link = d.opportunityId ? `${appUrl()}/opportunity/${d.opportunityId}` : `${appUrl()}/applications`;
      const body = simpleEmail({
        greetingName: user.name.split(' ')[0],
        paragraphs: [`${d.title}${d.organization ? ` (${d.organization})` : ''} closes ${when}.`, 'Confirm the date on the official source before you apply.', `Stop deadline emails: ${unsubscribeUrl(user, 'deadlines')}`],
        action: { label: 'Open in SarthiAI', url: link },
      });
      // Keyed by the date too, so a moved deadline is reminded again.
      const r = await sendOnce(user, `deadline:${d.opportunityId ?? d.applicationId}:${istDay(d.date)}`, { kind: 'deadline_reminder', subject: `Closes ${n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`}: ${d.title}`, ...body });
      if (r.sent) sent += 1;
    }
  }
  return { deadlineEmails: sent };
}

/** Weekly digest (Mondays, India time): upcoming dates and new matches. Skipped when there's nothing to say. */
export async function runWeeklyDigest(now = new Date(), { force = false } = {}) {
  const ist = new Date(now.getTime() + IST);
  if (!force && !(ist.getUTCDay() === 1 && ist.getUTCHours() >= 8)) return { digests: 0, skipped: 'not Monday morning' };
  const week = isoWeek(now);
  const users = await User.find({ ...emailable, 'notificationPrefs.emailDigest': { $ne: false }, onboardingCompletedAt: { $ne: null } });
  let sent = 0;
  for (const user of users) {
    const deadlines = (await getDeadlines(user, { now, horizonDays: 14 })).filter((d) => !d.overdue).slice(0, 6);
    const { items } = await recommendedMatches(user, { limit: 20, now });
    const weekAgo = now.getTime() - 7 * 86400000;
    const fresh = items.filter((o) => new Date(o.createdAt ?? o.updatedAt ?? 0).getTime() >= weekAgo).slice(0, 5);
    if (!deadlines.length && !fresh.length) continue;
    const paragraphs = [
      ...(deadlines.length ? [`Coming up in the next 2 weeks:\n${deadlines.map((d) => `• ${d.title} — ${fmt(d.date)}`).join('\n')}`] : []),
      ...(fresh.length ? [`New this week that fit your profile:\n${fresh.map((o) => `• ${o.title} (${o.organization})${o.deadline ? ` — closes ${fmt(o.deadline)}` : ''}`).join('\n')}`] : []),
      'Every listing links to its official source. Confirm details there before applying.',
      `Stop weekly emails: ${unsubscribeUrl(user, 'digest')}`,
    ];
    const r = await sendOnce(user, `digest:${week}`, { kind: 'weekly_digest', subject: 'Your week on SarthiAI', ...simpleEmail({ greetingName: user.name.split(' ')[0], paragraphs, action: { label: 'Open SarthiAI', url: `${appUrl()}/` } }) });
    if (r.sent) sent += 1;
  }
  return { digests: sent, week };
}

/**
 * "Notify me when dates are announced": runs after data refreshes, admin edits
 * and on the schedule. Each watch fires once, when its listing gets a deadline.
 */
export async function runDateWatches(now = new Date()) {
  const watches = await DateWatch.find({ notifiedAt: null }).lean();
  if (!watches.length) return { dateAlerts: 0 };
  const opps = await Opportunity.find({ _id: { $in: watches.map((w) => w.opportunityId) }, deadline: { $ne: null }, status: 'published' }).lean();
  const byId = new Map(opps.map((o) => [String(o._id), o]));
  let sent = 0;
  for (const w of watches) {
    const o = byId.get(String(w.opportunityId));
    if (!o) continue;
    const user = await User.findById(w.userId);
    await DateWatch.updateOne({ _id: w._id }, { $set: { notifiedAt: now } });
    if (!user) continue;
    // In-app: it's saved, so the date appears in "Coming up" and in phone reminders.
    await SavedOpportunity.updateOne({ userId: user._id, opportunityId: o._id }, { $setOnInsert: { userId: user._id, opportunityId: o._id } }, { upsert: true });
    if (new Date(o.deadline) < now) continue;
    const r = await sendOnce(user, `dates:${o._id}:${istDay(o.deadline)}`, {
      kind: 'dates_announced', subject: `Dates announced: ${o.title}`,
      ...simpleEmail({ greetingName: user.name.split(' ')[0], paragraphs: [`${o.title} (${o.organization}) now has a deadline: ${fmt(o.deadline)}.`, 'You asked SarthiAI to tell you. Confirm the date on the official source.'], action: { label: 'See the listing', url: `${appUrl()}/opportunity/${o._id}` } }),
    });
    if (r.sent) sent += 1;
  }
  return { dateAlerts: sent };
}

/** Saved searches with alerts: at most one email a day per search, listing new matches since the last check. */
export async function runSavedSearchAlerts(now = new Date()) {
  const dayAgo = new Date(now.getTime() - 20 * 3600000);
  const searches = await SavedSearch.find({ alerts: true, lastCheckedAt: { $lte: dayAgo } }).lean();
  let sent = 0;
  for (const s of searches) {
    const user = await User.findById(s.userId);
    await SavedSearch.updateOne({ _id: s._id }, { $set: { lastCheckedAt: now } });
    if (!user) continue;
    let items;
    try {
      ({ items } = await searchOpportunities(user, { ...searchQueryFromParams(Object.fromEntries(Object.entries(s.params))), page: 1, limit: 50 }, now));
    } catch { continue; }
    const fresh = items.filter((o) => new Date(o.createdAt ?? 0) > new Date(s.lastCheckedAt)).slice(0, 10);
    if (!fresh.length) continue;
    const query = new URLSearchParams(Object.fromEntries(Object.entries(s.params))).toString();
    const r = await sendOnce(user, `search:${s._id}:${istDay(now)}`, {
      kind: 'search_alert', subject: `${fresh.length} new for “${s.name}”`,
      ...simpleEmail({
        greetingName: user.name.split(' ')[0],
        paragraphs: [`New listings for your saved search “${s.name}”:\n${fresh.map((o) => `• ${o.title} (${o.organization})${o.deadline ? ` — closes ${fmt(o.deadline)}` : ''}`).join('\n')}`, `Stop these emails: turn off alerts for this search in Find ▸ Saved searches, or ${unsubscribeUrl(user, 'all')}`],
        action: { label: 'See all results', url: `${appUrl()}/discover?${query}` },
      }),
    });
    if (r.sent) sent += 1;
  }
  return { searchAlerts: sent };
}

export async function runAllJobs(now = new Date(), { forceDigest = false } = {}) {
  const out = {};
  for (const [name, job] of [['dateWatches', () => runDateWatches(now)], ['deadlines', () => runDeadlineReminders(now)], ['digest', () => runWeeklyDigest(now, { force: forceDigest })], ['searches', () => runSavedSearchAlerts(now)]]) {
    try { Object.assign(out, await job()); } catch (err) { logger.error('Notification job failed', { job: name, error: err }); out[`${name}Error`] = true; }
  }
  return out;
}

/** Hourly in-process runner (Render Starter or any always-on host). Returns stop(). */
export function startNotificationJobs({ everyMs = 60 * 60 * 1000 } = {}) {
  const tick = () => runAllJobs().then((r) => logger.info('Notification jobs ran', r)).catch(() => {});
  const timer = setInterval(tick, everyMs);
  timer.unref?.();
  setTimeout(tick, 60 * 1000).unref?.();
  return () => clearInterval(timer);
}
