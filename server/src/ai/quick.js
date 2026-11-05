import { searchOpportunities, recommendedMatches } from '../services/opportunities.js';
import { getDeadlines, getNextMoves } from '../services/nextMoves.js';
import { Application } from '../models/Application.js';
import { istDate } from './context.js';
import { calendarDaysUntil } from '../utils/dates.js';

/**
 * Quick answers: a deterministic, no-LLM fallback for the assistant.
 *
 * Used when the AI provider is not configured or unavailable. It recognises a
 * few common intents and answers ONLY from the same services the AI tools
 * use, so it can never invent facts. Anything else becomes a ranked search.
 */

const INTENTS = [
  { id: 'deadlines', rx: /\b(deadline|deadlines|due|closing|closes|last date|expir|reminder)/i },
  { id: 'next', rx: /\b(next move|next step|what should i do|what to do|todo|to-do|plan for|where (do|should) i start)/i },
  { id: 'applications', rx: /\b(my applications?|tracker|tracked|applied|application status)/i },
  { id: 'recommend', rx: /\b(recommend|suggest|match(es)?|suits? me|for me|eligible for|best (for|options)|(should|can|could) i apply|apply (to|for)|which .* apply|kahan apply|kya apply)/i },
];

const fmtDate = (d) => {
  const ist = istDate(d);
  if (!ist) return 'date unknown';
  const [y, m, day] = ist.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};
const daysLeft = (d, now) => {
  const n = calendarDaysUntil(d, now);
  return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n > 0 ? `in ${n} days` : `${-n} days ago`;
};
const cite = (o) => ({ opportunityId: o.id, title: o.title, sourceUrl: o.sourceUrl, verificationStatus: o.verificationStatus });

function describe(o, now) {
  const when = o.deadline ? `closes ${fmtDate(o.deadline)} (${daysLeft(o.deadline, now)})` : o.availability === 'upcoming' ? 'opening soon' : 'deadline not published';
  const why = o.match?.factors?.find((f) => f.positive)?.detail;
  return `• **${o.title}** — ${o.organization} · ${when}.${why ? ` ${why}` : ''}${o.verificationStatus !== 'verified' ? ' (not yet verified)' : ''}`;
}

export async function quickAnswer(user, message, { now = new Date() } = {}) {
  const intent = INTENTS.find((i) => i.rx.test(message))?.id ?? 'search';
  let reply;
  let citations = [];

  if (intent === 'deadlines') {
    const items = await getDeadlines(user, { now });
    reply = items.length
      ? `Your upcoming dates (from your tracker and saved items):\n${items.slice(0, 8).map((d) => `• ${fmtDate(d.date)} (${daysLeft(d.date, now)}) — ${d.kind === 'next_action' ? `next action: ${d.title} (${d.organization})` : d.title}`).join('\n')}`
      : 'You have no upcoming deadlines in the next 60 days. Save or track opportunities to see their dates here.';
  } else if (intent === 'next') {
    const moves = await getNextMoves(user, { now });
    reply = moves.length
      ? `Here is what I would do next:\n${moves.map((m, i) => `${i + 1}. **${m.title}** — ${m.detail}`).join('\n')}`
      : 'Nothing urgent right now. Explore Discover for new opportunities.';
  } else if (intent === 'applications') {
    const apps = await Application.find({ userId: user._id, archived: false }).sort({ updatedAt: -1 }).limit(10).lean();
    reply = apps.length
      ? `Your tracked applications:\n${apps.map((a) => `• **${a.title}** — ${a.status.replaceAll('_', ' ')}${a.deadline ? `, deadline ${fmtDate(a.deadline)}` : ''}${a.nextAction ? `. Next: ${a.nextAction}` : ''}`).join('\n')}`
      : 'You are not tracking any applications yet. Open an opportunity and tap Track to add one.';
  } else if (intent === 'recommend') {
    const { items, excludedIneligible } = await recommendedMatches(user, { limit: 5, now, tier: 'all', possibleLimit: 3 });
    const rec = items.filter((o) => o.tier === 'recommended');
    const pos = items.filter((o) => o.tier === 'possible');
    citations = items.slice(0, 6).map(cite);
    reply = [
      rec.length ? `Best verified matches for your profile:\n${rec.map((o) => describe(o, now)).join('\n')}` : 'I could not confirm a strong match from your profile yet — adding your degree, year and skills helps a lot.',
      pos.length ? `\nAlso worth checking (open, but I couldn't confirm every criterion):\n${pos.map((o) => describe(o, now)).join('\n')}` : '',
      excludedIneligible ? `\n${excludedIneligible} listing${excludedIneligible === 1 ? ' was' : 's were'} left out because a required criterion is not met.` : '',
    ].filter(Boolean).join('\n');
  } else {
    const { items, meta } = await searchOpportunities(user, { q: message, sort: 'relevance', page: 1, limit: 5 }, now);
    citations = items.map(cite);
    reply = items.length
      ? `${meta.search?.relaxed ? 'No exact matches, but these are closely related' : 'Here is what I found'}:\n${items.map((o) => describe(o, now)).join('\n')}`
      : 'I could not find opportunities for that. Try a skill, a field (e.g. "machine learning internship") or a type such as "scholarship".';
  }

  return {
    reply: `${reply}\n\n_Quick answer from your SarthiAI data — always confirm details on the official source._`,
    citations,
    proposedActions: [],
    toolsUsed: [`quick:${intent}`],
    grounding: { status: 'verified', unverifiedClaims: [] },
    model: 'sarthi-quick',
  };
}
