import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useUser } from '../lib/session';
import { useAsync } from '../lib/useAsync';
import { daysUntil, greeting, relativeDays } from '../lib/format';
import { Avatar } from '../components/Avatar';
import type { NextMove, OpportunityType, TypeSummary } from '../lib/types';
import { OpportunityRow } from '../components/OpportunityRow';
import { Empty, ErrorState, Skeleton } from '../components/ui';
import { IconArrowRight, IconBookmark, IconChat, IconDoc, IconMegaphone, IconRoute } from '../components/icons';

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

/** The four category tiles. Each counts exactly what its Find link lists (open listings of that type). */
const CATEGORIES: { label: string; cat: string; type: OpportunityType }[] = [
  { label: 'Scholarships', cat: 'cat-scholarship', type: 'scholarship' },
  { label: 'Internships', cat: 'cat-internship', type: 'internship' },
  { label: 'Research', cat: 'cat-research', type: 'research' },
  { label: 'Hackathons', cat: 'cat-hackathon', type: 'hackathon' },
];

/** Secondary line for a tile: how the open listings split by eligibility. */
export function tileNote(t: TypeSummary | undefined) {
  if (!t || t.open === 0) return 'Nothing open right now';
  const parts = [];
  if (t.likelyEligible) parts.push(`${t.likelyEligible} fit you`);
  if (t.needDetails) parts.push(`${t.needDetails} need your details`);
  if (!parts.length && t.closingIn30Days) parts.push(`${t.closingIn30Days} close within 30 days`);
  return parts.join(' · ') || 'Open now';
}

export function Home() {
  const user = useUser();
  const moves = useAsync(() => api.nextMoves(), []);
  const deadlines = useAsync(() => api.deadlines(), []);
  const matches = useAsync(() => api.matches({ limit: 30, tier: 'all' }), []);
  const roadmap = useAsync(() => api.roadmap(), []);
  const notices = useAsync(() => api.announcements(), []);
  const plan = useAsync(() => api.plan(), []);
  const summary = useAsync(() => api.openSummary(), []);

  const lead = moves.data?.[0];
  const all = matches.data?.data ?? [];
  const recommended = all.filter((o) => o.tier !== 'possible');
  const topThree = (recommended.length ? recommended : all).slice(0, 3);

  // Hero number: days until the next move is due, else the nearest upcoming deadline.
  const heroDate = lead?.dueAt ?? deadlines.data?.find((d) => daysUntil(d.date) >= 0)?.date ?? null;
  const heroDays = heroDate ? Math.max(0, daysUntil(heroDate)) : null;
  const progress = roadmap.data?.progress;
  const progressPct = progress && progress.total ? Math.round((progress.completed / progress.total) * 100) : null;

  return (
    <div className="page">
      <header className="topbar">
        <div className="grow">
          <p className="faint" style={{ margin: 0 }}>{greeting()}</p>
          <h1 style={{ margin: 0 }}>{user.name}</h1>
        </div>
        <Link to="/saved" className="icon-btn" aria-label="Saved"><IconBookmark size={18} /></Link>
        <Link to="/profile" className="avatar-link" aria-label="Profile"><Avatar name={user.name} /></Link>
      </header>

      {/* ---- Bento grid ---- */}
      <section className="bento" aria-label="Overview">
        {moves.loading && !moves.data ? <div className="skeleton full" style={{ height: 150 }} /> : moves.error ? <div className="full"><ErrorState error={moves.error} onRetry={moves.reload} /></div> : lead ? (
          <div className="tile tile-hero full">
            <div className="hero-top">
              <div className="grow">
                <p className="hero-title">{lead.title}</p>
                <p className="hero-detail">{lead.detail}</p>
              </div>
              {heroDays != null && (
                <div className="hero-days" aria-label={`${heroDays} days left`}>
                  <div className="num">{heroDays}</div>
                  <span>{heroDays === 1 ? 'day left' : 'days left'}</span>
                </div>
              )}
            </div>
            {progressPct != null && (
              <div className="hero-bar" role="progressbar" aria-label="Roadmap progress" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
                <div style={{ width: `${progressPct}%` }} />
              </div>
            )}
            <Link to={moveLink(lead)} className="hero-link">Continue <IconArrowRight size={16} style={{ marginLeft: 6 }} /></Link>
          </div>
        ) : null}

        {CATEGORIES.map((c) => {
          const t = summary.data?.types[c.type];
          return (
            <Link key={c.type} to={`/discover?type=${c.type}`} className={`tile ${c.cat}`} aria-label={`${t ? t.open : 'Loading'} open ${c.label}. ${summary.data ? tileNote(t) : ''}`}>
              <span className="num">{summary.loading && !summary.data ? '–' : summary.error ? '?' : t?.open ?? 0}</span>
              <span className="tile-label">{c.label}</span>
              <span className="tile-note">{summary.data ? tileNote(t) : ' '}</span>
            </Link>
          );
        })}

        <Link to="/sarthi" className="tile plain full" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 0 }}>
          <span className="ask-icon"><IconChat size={22} /></span>
          <span className="grow">
            <strong style={{ display: 'block', fontSize: 15 }}>Ask Sarthi</strong>
            <span className="faint">“Which scholarships can I apply to this month?”</span>
          </span>
        </Link>
      </section>

      {/* ---- Second row: plan, roadmap, drafts, campus ---- */}
      <section className="bento" style={{ marginTop: 8 }} aria-label="Shortcuts">
        <Link to="/plan" className="tile plain small">
          <IconRoute size={20} />
          <span className="grow">{plan.data && plan.data.summary.unlockable > 0 ? `${plan.data.summary.unlockable} one skill away` : '90-day plan'}</span>
        </Link>
        <Link to="/roadmap" className="tile plain small">
          <span className="num" style={{ fontSize: 18 }}>{progress ? `${progress.completed}/${progress.total}` : '0'}</span>
          <span className="grow">Roadmap</span>
        </Link>
        <Link to="/drafts" className="tile plain small"><IconDoc size={20} /><span className="grow">Drafts</span></Link>
        {(notices.data?.length ?? 0) > 0 ? (
          <a href="#campus" className="tile plain small"><IconMegaphone size={20} /><span className="grow">{notices.data!.length} campus notice{notices.data!.length === 1 ? '' : 's'}</span></a>
        ) : (
          <Link to="/applications" className="tile plain small"><IconBookmark size={20} /><span className="grow">Applied</span></Link>
        )}
      </section>

      {/* ---- Coming up ---- */}
      <section className="section">
        <div className="section-head"><h2>Coming up</h2><Link to="/applications">All</Link></div>
        {deadlines.loading && !deadlines.data ? <Skeleton count={2} height={52} /> : deadlines.error ? <ErrorState error={deadlines.error} onRetry={deadlines.reload} /> : deadlines.data?.length ? (
          <ul className="list card" style={{ padding: '0 14px' }}>
            {deadlines.data.slice(0, 3).map((d, i) => {
              const n = daysUntil(d.date);
              return (
                <li key={i}>
                  <Link to={d.opportunityId ? `/opportunity/${d.opportunityId}` : '/applications'} className="mini-row">
                    <span className="grow">
                      <strong>{d.title}</strong>
                      <span className="faint">{d.kind === 'next_action' ? `Next action · ${d.organization}` : d.kind === 'saved_deadline' ? 'Saved' : 'Application deadline'}</span>
                    </span>
                    <span className={`tag ${d.overdue || n <= 14 ? 'urgent' : ''}`}>{d.overdue ? 'Overdue' : relativeDays(d.date)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : <p className="faint">No dates in the next 60 days. Save or track an opportunity to see its deadline here.</p>}
      </section>

      {/* ---- Matched for you ---- */}
      <section className="section">
        <div className="section-head"><h2>Matched for you</h2><Link to="/discover">See all</Link></div>
        {matches.loading && !matches.data ? <Skeleton count={3} height={120} /> : matches.error ? <ErrorState error={matches.error} onRetry={matches.reload} /> : topThree.length ? (
          <div className="stack">{topThree.map((o) => <OpportunityRow key={o.id} o={o} />)}</div>
        ) : (
          <Empty title="No matches yet">Add your degree, year and skills so SarthiAI can check criteria. <Link to="/profile/edit">Complete profile</Link></Empty>
        )}
      </section>

      {/* ---- Campus notices (compact) ---- */}
      {(notices.data?.length ?? 0) > 0 && (
        <section className="section" id="campus">
          <h2>From your campus</h2>
          <ul className="list card" style={{ padding: '0 14px' }}>
            {notices.data!.slice(0, 3).map((a) => (
              <li key={a.id} style={{ padding: '12px 0' }}>
                <strong className="small">{a.title}</strong>
                <p className="small muted prewrap" style={{ margin: '2px 0 0' }}>{a.body.length > 160 ? `${a.body.slice(0, 158)}…` : a.body}</p>
                {a.linkedOpportunityId && <Link className="small" to={`/opportunity/${a.linkedOpportunityId}`}>View opportunity</Link>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
