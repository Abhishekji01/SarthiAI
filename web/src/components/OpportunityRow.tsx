import { Link } from 'react-router-dom';
import type { Opportunity } from '../lib/types';
import { deadlineLabel, formatMoney, TYPE_LABEL } from '../lib/format';
import { IconBookmark } from './icons';

export function VerificationTag({ o }: { o: Pick<Opportunity, 'verificationStatus' | 'isStale'> }) {
  if (o.verificationStatus === 'verified') return <span className={`tag ${o.isStale ? 'amber' : 'jade'}`}>{o.isStale ? 'Verified · recheck' : 'Verified'}</span>;
  if (o.verificationStatus === 'needs_review') return <span className="tag amber">Needs review</span>;
  return <span className="tag muted">Not yet verified</span>;
}

export function DeadlineTag({ o }: { o: Pick<Opportunity, 'deadline' | 'availability' | 'applicationOpensAt'> }) {
  const d = deadlineLabel(o);
  return <span className={`tag ${d.tone}`}>{d.text}</span>;
}

export function OpportunityRow({ o, showWhy = true }: { o: Opportunity; showWhy?: boolean }) {
  const money = formatMoney(o.stipend) ?? formatMoney(o.award);
  const restricted = o.match?.factors.find((f) => f.factor === 'audience');
  const why = o.match?.factors.find((f) => f.positive && f.factor !== 'deadline');
  return (
    <Link to={`/opportunity/${o.id}`} className="opp">
      <article className="card">
        <div className="opp-head">
          <div className="opp-mark" aria-hidden="true">{o.organization.replace(/^(the|indian|national)\s+/i, '').charAt(0).toUpperCase()}</div>
          <div className="grow">
            <p className="kicker" style={{ marginBottom: 2 }}>{TYPE_LABEL[o.opportunityType]} · {o.organization}</p>
            <h3>{o.title}</h3>
          </div>
          {o.match && !o.match.hardBlocked && (
            <div style={{ textAlign: 'right' }} title={o.match.scoreLabel}>
              <div className="score">{o.match.score}</div>
              <div className="tiny faint">match</div>
            </div>
          )}
        </div>
        {showWhy && restricted && <p className="small" style={{ color: 'var(--amber)', margin: '8px 0 0' }}>{restricted.detail}</p>}
        {showWhy && !restricted && why && <p className="small muted" style={{ margin: '8px 0 0' }}>{why.detail}</p>}
        <div className="opp-meta">
          <DeadlineTag o={o} />
          <VerificationTag o={o} />
          {o.tier === 'possible' && <span className="tag accent">Worth checking</span>}
          {o.match?.hardBlocked && <span className="tag coral">Criterion not met</span>}
          {money && <span className="tag">{money.length > 34 ? `${money.slice(0, 32)}…` : money}</span>}
          {o.workMode === 'remote' && <span className="tag">Remote</span>}
          {o.collegeId && <span className="tag accent">Your campus</span>}
          {o.tracked && <span className="tag accent">Tracked</span>}
          {o.isSaved && <span className="tag" aria-label="Saved"><IconBookmark size={12} filled /> Saved</span>}
        </div>
      </article>
    </Link>
  );
}
