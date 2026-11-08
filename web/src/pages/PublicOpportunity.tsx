import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { openExternal } from '../lib/platform';
import { TYPE_LABEL } from '../lib/format';
import { usePageTitle } from '../lib/usePageTitle';
import { welcomeWithNext } from '../lib/next';
import { DeadlineTag, VerificationTag } from '../components/OpportunityRow';
import { OfficialDescription, opportunityFacts, ShareButton, SourceSection } from '../components/OpportunityFacts';
import { ErrorState, LogoMark, Skeleton } from '../components/ui';
import { IconCheck, IconDoc, IconExternal } from '../components/icons';

/**
 * A listing for someone who isn't signed in (a shared link): the official
 * details, source and deadline. Fit, eligibility and the tracker need an account.
 */
export function PublicOpportunity() {
  const { id = '' } = useParams();
  const { data: o, error, loading, reload } = useAsync(() => api.publicOpportunity(id), [id]);
  usePageTitle(o?.title ?? 'Opportunity');
  const next = welcomeWithNext(`/opportunity/${id}`);

  return (
    <div className="page no-nav" style={{ maxWidth: 760 }}>
      <header className="topbar">
        <Link to="/welcome" className="row" style={{ gap: 10, color: 'inherit', textDecoration: 'none' }} aria-label="SarthiAI home"><LogoMark size={32} /><strong>SarthiAI</strong></Link>
        <span className="grow" />
        {o && <ShareButton o={o} />}
        <Link to={next} className="btn small">Sign in</Link>
      </header>
      {loading && !o ? <Skeleton count={3} /> : error || !o ? (
        <>
          <ErrorState error={error ?? new Error('Not found')} onRetry={reload} />
          <p className="small muted" style={{ marginTop: 12 }}>This listing may have been removed, or it is only visible to students of one college. <Link to="/welcome">Go to SarthiAI</Link></p>
        </>
      ) : (
        <>
          <p className="faint">{TYPE_LABEL[o.opportunityType]} · {o.organization}</p>
          <h1>{o.title}</h1>
          <div className="opp-meta" style={{ marginBottom: 16 }}>
            <DeadlineTag o={o} />
            <VerificationTag o={o} />
          </div>
          <div className="row wrap" style={{ marginBottom: 20 }}>
            <button className="btn" onClick={() => openExternal(o.applicationUrl ?? o.sourceUrl)}><IconExternal size={18} /> {o.applicationUrl ? 'Apply on official site' : 'Official source'}</button>
          </div>

          <section className="card lead" aria-labelledby="cta-title">
            <h2 id="cta-title" style={{ color: 'inherit' }}>Sign in to check your eligibility</h2>
            <p className="small" style={{ opacity: 0.9 }}>SarthiAI checks each official criterion against your profile, tracks the deadline and reminds you. Free for students.</p>
            <div className="row wrap" style={{ marginTop: 12 }}>
              <Link to={`${next}${next.includes('?') ? '&' : '?'}mode=register`} className="btn on-lead"><IconCheck size={18} /> Create a free account</Link>
              <Link to={next} className="btn ghost on-lead-ghost">I have an account</Link>
            </div>
          </section>

          {o.summary && (
            <section className="section">
              <p className="faint">In short {o.summarySource === 'ai' ? '· AI summary' : ''}</p>
              <p>{o.summary}</p>
            </section>
          )}
          <dl className="facts section">{opportunityFacts(o).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          {o.deadlineNote && <p className="quote">{o.deadlineNote}</p>}
          {o.officialDescription && <OfficialDescription text={o.officialDescription} sourceUrl={o.sourceUrl} />}
          {o.requiredDocuments.length > 0 && (
            <section className="section">
              <h2>Documents you’ll need</h2>
              <ul className="list card" style={{ padding: '2px 16px' }}>
                {o.requiredDocuments.map((d) => <li key={d} className="row small" style={{ padding: '10px 0' }}><IconDoc size={18} style={{ color: 'var(--ink-3)', flexShrink: 0 }} /> {d}</li>)}
              </ul>
            </section>
          )}
          <SourceSection o={o} />
        </>
      )}
    </div>
  );
}
