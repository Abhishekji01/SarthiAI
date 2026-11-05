import { Link } from 'react-router-dom';
import type { Match, Opportunity } from '../lib/types';
import { categoryOf, daysUntil, deadlineLabel, formatMoney, initials, TYPE_LABEL } from '../lib/format';
import { IconBookmark } from './icons';

/** Kept for the detail page (one verification label there; the card shows a small ✓ instead). */
export function VerificationTag({ o }: { o: Pick<Opportunity, 'verificationStatus' | 'isStale'> }) {
  if (o.verificationStatus === 'verified') return <span className={`tag ${o.isStale ? 'amber' : 'jade'}`}>{o.isStale ? 'Verified · recheck' : 'Verified'}</span>;
  if (o.verificationStatus === 'needs_review') return <span className="tag amber">Needs review</span>;
  return <span className="tag muted">Not yet verified</span>;
}

/** Deadline pill: yellow when 14 days or less, plain grey otherwise. */
export function DeadlineTag({ o }: { o: Pick<Opportunity, 'deadline' | 'availability' | 'applicationOpensAt'> }) {
  const d = deadlineLabel(o);
  const urgent = o.availability !== 'closed' && o.deadline != null && daysUntil(o.deadline) <= 14 && daysUntil(o.deadline) >= 0;
  return <span className={`tag ${urgent ? 'urgent' : ''}`}>{d.text}</span>;
}

/** 3-bar fit meter from the heuristic score and the eligibility result (never a raw number). */
export function fitLevel(m: Match): { bars: 0 | 1 | 2 | 3; label: string } {
  if (m.hardBlocked) return { bars: 0, label: 'Not eligible' };
  if (m.score >= 65 && m.eligibilityOverall !== 'insufficient_source_info') return { bars: 3, label: 'Strong fit' };
  if (m.score >= 45) return { bars: 2, label: 'Good fit' };
  return { bars: 1, label: 'Check criteria' };
}

export function FitMeter({ match }: { match: Match }) {
  const f = fitLevel(match);
  if (f.bars === 0) return <div className="fit blocked">Not eligible</div>;
  return (
    <div className="fit" title={match.scoreLabel}>
      <span className="fit-bars" aria-hidden="true">{[1, 2, 3].map((i) => <i key={i} className={i <= f.bars ? 'on' : ''} />)}</span>
      <span>{f.label}</span>
    </div>
  );
}

export function OpportunityRow({ o }: { o: Opportunity; showWhy?: boolean }) {
  const money = formatMoney(o.stipend) ?? formatMoney(o.award);
  const place = o.workMode === 'remote' ? 'Remote' : o.location?.city ?? (o.location?.isNationwide ? 'Across India' : null);
  const marked = Boolean(o.isSaved || o.tracked);
  // Hackathons and contests: always say where, since that decides whether a student can go.
  const eventWhere = o.opportunityType === 'hackathon' || o.opportunityType === 'competition'
    ? (o.workMode === 'remote' ? 'Online' : o.location?.city ?? null) : null;
  return (
    <Link to={`/opportunity/${o.id}`} className="opp">
      <article className="card">
        <div className="opp-head">
          <div className={`opp-mark cat-${categoryOf(o.opportunityType)}`} aria-hidden="true">{initials(o.organization)}</div>
          <div className="grow">
            <p className="opp-org">
              {TYPE_LABEL[o.opportunityType]} · {o.organization}{eventWhere ? ` · ${eventWhere}` : ''}
              {o.verificationStatus === 'verified' && <span className="ok" aria-label="Verified"> ✓</span>}
            </p>
            <h3 className="opp-title">{o.title}</h3>
          </div>
          {marked && <span className="saved-mark" aria-label={o.tracked ? 'Tracked' : 'Saved'}><IconBookmark size={18} filled /></span>}
        </div>
        <div className="opp-row2">
          {money
            ? <span className="opp-amount">{money.length > 40 ? `${money.slice(0, 38)}…` : money}</span>
            : <span className="opp-amount none">{place ?? 'Amount not stated'}</span>}
          {o.nearby && <span className="tag jade">{o.nearby === 'city' ? 'In your city' : 'In your state'}</span>}
          <DeadlineTag o={o} />
        </div>
        {o.match && <FitMeter match={o.match} />}
      </article>
    </Link>
  );
}
