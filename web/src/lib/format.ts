import type { ApplicationStatus, Availability, EligibilityOverall, Money, Opportunity, OpportunityType } from './types';

/** Calendar days in India Standard Time, matching the server (utils/dates.js). */
const IST = 5.5 * 3600000;
const DAY = 86400000;
const istDay = (d: string | Date) => Math.floor((new Date(d).getTime() + IST) / DAY);
export const daysUntil = (d: string | Date, now = new Date()) => istDay(d) - istDay(now);

export function formatDate(d: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!d) return 'Unknown';
  return new Date(d).toLocaleDateString('en-IN', { ...opts, timeZone: 'Asia/Kolkata' });
}

export function relativeDays(d: string | Date) {
  const n = daysUntil(d);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

export function deadlineLabel(o: Pick<Opportunity, 'deadline' | 'availability' | 'applicationOpensAt'>) {
  if (o.availability === 'closed') return { text: o.deadline ? `Closed ${formatDate(o.deadline, { day: 'numeric', month: 'short' })}` : 'Closed', tone: 'muted' as const };
  if (o.availability === 'upcoming') return { text: o.applicationOpensAt ? `Opens ${formatDate(o.applicationOpensAt, { day: 'numeric', month: 'short' })}` : 'Opening soon', tone: 'accent' as const };
  if (!o.deadline) return { text: 'Deadline not published', tone: 'muted' as const };
  const n = daysUntil(o.deadline);
  const tone = n <= 7 ? ('coral' as const) : n <= 21 ? ('amber' as const) : ('jade' as const);
  return { text: n <= 0 ? 'Closes today' : n === 1 ? 'Closes tomorrow' : n <= 30 ? `${n} days left` : `Closes ${formatDate(o.deadline, { day: 'numeric', month: 'short' })}`, tone };
}

export function formatMoney(m: Money | null | undefined) {
  if (!m) return null;
  if (m.amount == null) return m.description ?? null;
  const amt = m.currency === 'INR' ? `₹${m.amount.toLocaleString('en-IN')}` : `${m.currency} ${m.amount.toLocaleString('en-IN')}`;
  const period = { per_year: '/year', per_month: '/month', one_time: ' one-time', total: ' total' }[m.period ?? 'total'] ?? '';
  return `${amt}${m.period ? period : ''}`;
}

export const TYPE_LABEL: Record<OpportunityType, string> = {
  internship: 'Internship', scholarship: 'Scholarship', fellowship: 'Fellowship', research: 'Research', competition: 'Competition',
  hackathon: 'Hackathon', job: 'Job', program: 'Programme',
};

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  interested: 'Interested', preparing: 'Preparing', ready_to_apply: 'Ready to apply', applied: 'Applied', assessment: 'Assessment',
  interview: 'Interview', offer: 'Offer', rejected: 'Not selected', withdrawn: 'Withdrawn',
};

export const OVERALL_LABEL: Record<EligibilityOverall, { text: string; tone: 'jade' | 'amber' | 'coral' | 'muted' }> = {
  all_criteria_met: { text: 'You meet every checked criterion', tone: 'jade' },
  missing_information: { text: 'Some criteria need your confirmation', tone: 'amber' },
  likely_ineligible: { text: 'A required criterion is not met', tone: 'coral' },
  insufficient_source_info: { text: 'Not enough source information to check', tone: 'muted' },
};

export const AVAILABILITY_LABEL: Record<Availability, string> = { open: 'Open', closed: 'Closed', upcoming: 'Upcoming', unknown: 'Dates unverified' };

export const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export const firstName = (name?: string | null) => (name ?? '').trim().split(/\s+/)[0] || 'there';

export function greeting(now = new Date()) {
  const h = Number(new Date(now).toLocaleString('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** YYYY-MM-DD for <input type="date"> in IST. */
export const toDateInput = (d: string | null | undefined) => (d ? new Date(new Date(d).getTime() + IST).toISOString().slice(0, 10) : '');
/** End of the chosen IST day as an ISO instant (deadlines are "by end of day"). */
export const fromDateInput = (v: string) => (v ? new Date(`${v}T23:59:00+05:30`).toISOString() : null);

/** One tint per category, used everywhere (tiles, listing logos). Maps to .cat-* CSS classes. */
export type Category = 'scholarship' | 'internship' | 'research' | 'hackathon' | 'job';
export function categoryOf(t: OpportunityType): Category {
  if (t === 'research' || t === 'fellowship') return 'research';
  if (t === 'hackathon' || t === 'competition') return 'hackathon';
  if (t === 'job' || t === 'program') return 'job';
  return t;
}

/** Up to two initials for a "logo" square: "Indian Academy of Sciences" -> "IA", "Stripe" -> "ST". */
export function initials(name: string) {
  const words = name.replace(/[^A-Za-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !/^(the|of|and|for|&)$/i.test(w));
  if (!words.length) return '?';
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Initials for a person's avatar: letters only (any script), first + last word.
 * Returns null when the name has no letters, so callers can show an icon instead.
 */
export function personInitials(name: string | null | undefined): string | null {
  const words = String(name ?? '').normalize('NFC').split(/\s+/).map((w) => w.replace(/[^\p{L}]/gu, '')).filter(Boolean);
  if (!words.length) return null;
  const first = [...words[0]][0];
  const last = words.length > 1 ? [...words[words.length - 1]][0] : '';
  return (first + last).toLocaleUpperCase('en-IN');
}

/** Cuts text at a word boundary and adds "…" when anything was removed. */
export function clipAtWord(text: string, max: number) {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('\n'));
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:–—-]+$/, '')}…`;
}

/** Text stored before scrapers clipped at word boundaries may end mid-word; tidy it for display. */
export function tidyEnding(text: string, limitHint = 3000) {
  const t = text.trim();
  if (t.length < limitHint || /[.!?…)"”\]]$/.test(t)) return t;
  const space = t.lastIndexOf(' ');
  return `${(space > t.length - 60 ? t.slice(0, space) : t).replace(/[\s,;:–—-]+$/, '')}…`;
}

const ymd = (d: string | Date) => new Date(new Date(d).getTime() + IST).toISOString().slice(0, 10).replace(/-/g, '');

/** "Add to Google Calendar": an all-day event on the deadline date (India time). Same as the server's .ics. */
export function googleCalendarUrl(o: { title: string; organization: string; sourceUrl: string; deadline: string | null }, pageUrl?: string) {
  if (!o.deadline) return null;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Deadline: ${o.title}`,
    dates: `${ymd(o.deadline)}/${ymd(new Date(new Date(o.deadline).getTime() + DAY))}`,
    details: `${o.organization}\nOfficial source: ${o.sourceUrl}${pageUrl ? `\nOn SarthiAI: ${pageUrl}` : ''}`,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
