import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useUser } from '../lib/session';
import { useAsync } from '../lib/useAsync';
import { firstName, formatDate, greeting, relativeDays } from '../lib/format';
import type { NextMove } from '../lib/types';
import { OpportunityRow } from '../components/OpportunityRow';
import { Empty, ErrorState, Progress, Skeleton } from '../components/ui';
import { IconBookmark, IconCalendar, IconDoc, IconMegaphone, IconRoute, IconSpark, IconUser } from '../components/icons';

function moveLink(m: NextMove) {
  switch (m.target.type) {
    case 'profile': return '/profile/edit';
    case 'application': return '/applications';
    case 'opportunity': return `/opportunity/${m.target.id}`;
    case 'milestone':
    case 'roadmap': return '/roadmap';
    default: return '/';
  }
}

export function Home() {
  const user = useUser();
  const navigate = useNavigate();
  const moves = useAsync(() => api.nextMoves(), []);
  const deadlines = useAsync(() => api.deadlines(), []);
  const matches = useAsync(() => api.matches({ limit: 8, tier: 'all' }), []);
  const roadmap = useAsync(() => api.roadmap(), []);
  const notices = useAsync(() => api.announcements(), []);
  const plan = useAsync(() => api.plan(), []);

  const lead = moves.data?.[0];
  const rest = moves.data?.slice(1, 4) ?? [];
  const recommended = matches.data?.data.filter((o) => o.tier !== 'possible') ?? [];
  const possible = matches.data?.data.filter((o) => o.tier === 'possible') ?? [];
  const meta = matches.data?.meta;

  return (
    <div className="page">
      <header className="topbar">
        <div className="grow">
          <p className="kicker" style={{ marginBottom: 2 }}>{formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1>{greeting()}, {firstName(user.name)}.</h1>
        </div>
        <Link to="/saved" className="icon-btn" aria-label="Saved"><IconBookmark size={18} /></Link>
        <Link to="/profile" className="icon-btn" aria-label="Profile"><IconUser size={18} /></Link>
      </header>

      {/* Your next move */}
      {moves.loading && !moves.data ? <Skeleton count={1} height={150} /> : moves.error ? <ErrorState error={moves.error} onRetry={moves.reload} /> : lead ? (
        <section className="card lead" aria-label="Your next move">
          <p className="kicker">Your next move</p>
          <h2 style={{ color: 'inherit' }}>{lead.title}</h2>
          <p className="muted" style={{ color: 'inherit', opacity: 0.9 }}>{lead.detail}</p>
          <div className="row wrap" style={{ marginTop: 12 }}>
            <button className="btn on-lead" onClick={() => navigate(moveLink(lead))}>Do this now</button>
            <span className="tiny" style={{ opacity: 0.8 }}>Why: {lead.reason}</span>
          </div>
        </section>
      ) : null}
      {rest.length > 0 && (
        <ul className="list card" style={{ padding: '2px 16px', marginTop: 12 }}>
          {rest.map((m, i) => (
            <li key={i}>
              <Link to={moveLink(m)} className="row" style={{ padding: '12px 0', color: 'inherit', textDecoration: 'none' }}>
                <span className="grow"><strong>{m.title}</strong><br /><span className="faint">{m.detail}</span></span>
                <span aria-hidden>›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Gap to plan */}
      {plan.data && plan.data.summary.unlockable > 0 && (
        <Link to="/plan" className="card row" style={{ marginTop: 16, color: 'inherit', textDecoration: 'none', borderColor: 'var(--accent)' }}>
          <span className="opp-mark"><IconRoute /></span>
          <span className="grow">
            <strong>{plan.data.summary.unlockable} more opportunit{plan.data.summary.unlockable === 1 ? 'y is' : 'ies are'} one skill away</strong>
            <br /><span className="faint">{plan.data.headline}</span>
          </span>
          <span aria-hidden>›</span>
        </Link>
      )}

      {/* Ask Sarthi */}
      <Link to="/sarthi" className="card soft row" style={{ marginTop: 16, color: 'inherit', textDecoration: 'none' }}>
        <span className="opp-mark"><IconSpark /></span>
        <span className="grow"><strong>Ask Sarthi</strong><br /><span className="faint">“Which scholarships can I apply to this month?”</span></span>
      </Link>

      {/* Deadlines */}
      <section className="section">
        <div className="section-head"><h2>Coming up</h2><Link to="/applications">Tracker</Link></div>
        {deadlines.loading && !deadlines.data ? <Skeleton count={2} height={56} /> : deadlines.error ? <ErrorState error={deadlines.error} onRetry={deadlines.reload} /> : deadlines.data?.length ? (
          <ul className="list card" style={{ padding: '2px 16px' }}>
            {deadlines.data.slice(0, 5).map((d, i) => (
              <li key={i}>
                <Link to={d.opportunityId ? `/opportunity/${d.opportunityId}` : '/applications'} className="row" style={{ padding: '12px 0', color: 'inherit', textDecoration: 'none' }}>
                  <IconCalendar size={20} style={{ color: d.overdue ? 'var(--coral)' : 'var(--ink-3)', flexShrink: 0 }} />
                  <span className="grow">
                    <strong>{d.kind === 'next_action' ? d.title : d.title}</strong>
                    <br /><span className="faint">{d.kind === 'next_action' ? `Next action · ${d.organization}` : d.kind === 'saved_deadline' ? 'Saved · deadline' : 'Application deadline'}</span>
                  </span>
                  <span className={`tag ${d.overdue ? 'coral' : 'amber'}`}>{d.overdue ? 'Overdue' : relativeDays(d.date)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="faint">No dates in the next 60 days. Save or track an opportunity to see its deadline here.</p>}
      </section>

      {/* Matches */}
      <section className="section">
        <div className="section-head"><h2>Matched for you</h2><Link to="/discover">See all</Link></div>
        {matches.loading && !matches.data ? <Skeleton count={3} /> : matches.error ? <ErrorState error={matches.error} onRetry={matches.reload} /> : (
          <>
            {recommended.length ? <div className="stack">{recommended.map((o) => <OpportunityRow key={o.id} o={o} />)}</div> : (
              <Empty title="No confirmed matches yet">
                Add your degree, year and skills so SarthiAI can check criteria. <Link to="/profile/edit">Complete profile</Link>
              </Empty>
            )}
            {possible.length > 0 && (
              <>
                <h3 style={{ marginTop: 22 }}>Also worth checking</h3>
                <p className="faint" style={{ marginTop: 0 }}>Open and not ruled out, but some criteria couldn’t be confirmed from your profile.</p>
                <div className="stack">{possible.slice(0, 5).map((o) => <OpportunityRow key={o.id} o={o} />)}</div>
              </>
            )}
            {meta && (meta.excludedIneligible > 0 || meta.excludedRestricted > 0) && (
              <p className="tiny faint" style={{ marginTop: 12 }}>
                {meta.excludedIneligible > 0 && `${meta.excludedIneligible} listing${meta.excludedIneligible === 1 ? '' : 's'} hidden because a required criterion isn’t met. `}
                {meta.excludedRestricted > 0 && `${meta.excludedRestricted} restricted to specific groups — still in Discover. `}
                Scores are heuristic match strength, not selection chances.
              </p>
            )}
          </>
        )}
      </section>

      {/* Roadmap */}
      <section className="section">
        <div className="section-head"><h2>Your roadmap</h2><Link to="/roadmap">Open</Link></div>
        {roadmap.data ? (
          <Link to="/roadmap" className="card" style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
            <p className="kicker">Goal</p>
            <h3>{roadmap.data.goal}</h3>
            <div className="row" style={{ marginTop: 10 }}>
              <div className="grow"><Progress value={roadmap.data.progress.completed} total={roadmap.data.progress.total} /></div>
              <span className="faint">{roadmap.data.progress.completed}/{roadmap.data.progress.total}</span>
            </div>
          </Link>
        ) : !roadmap.loading && <Link to="/roadmap" className="card soft" style={{ display: 'block', color: 'inherit' }}>Turn your goal into milestones — with Sarthi or by hand.</Link>}
      </section>

      {/* Campus */}
      {(notices.data?.length ?? 0) > 0 && (
        <section className="section">
          <div className="section-head"><h2>From your campus</h2></div>
          <div className="stack">
            {notices.data!.slice(0, 3).map((a) => (
              <article key={a.id} className="card">
                <div className="row"><IconMegaphone size={18} style={{ color: 'var(--accent)' }} /><p className="kicker" style={{ margin: 0 }}>{a.category} · {a.collegeName}</p></div>
                <h3 style={{ marginTop: 6 }}>{a.title}</h3>
                <p className="small muted prewrap" style={{ marginBottom: 6 }}>{a.body}</p>
                <div className="row wrap tiny faint">
                  {a.publishedAt && <span>Posted {formatDate(a.publishedAt)}</span>}
                  {a.linkedOpportunityId && <Link to={`/opportunity/${a.linkedOpportunityId}`}>View opportunity</Link>}
                  {a.sourceUrl && <a href={a.sourceUrl} target="_blank" rel="noreferrer">Source</a>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <Link to="/drafts" className="card soft row" style={{ color: 'inherit', textDecoration: 'none' }}>
          <IconDoc /><span className="grow"><strong>Drafts</strong><br /><span className="faint">Emails, cover letters and resumes</span></span><span aria-hidden>›</span>
        </Link>
      </section>
    </div>
  );
}
