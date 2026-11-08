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
import { usePageTitle } from '../lib/usePageTitle';
import { translate, useT } from '../i18n';
import type { MessageKey } from '../i18n/en';

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
const CATEGORIES: { label: MessageKey; cat: string; type: OpportunityType }[] = [
  { label: 'home.scholarships', cat: 'cat-scholarship', type: 'scholarship' },
  { label: 'home.internships', cat: 'cat-internship', type: 'internship' },
  { label: 'home.research', cat: 'cat-research', type: 'research' },
  { label: 'home.hackathons', cat: 'cat-hackathon', type: 'hackathon' },
];

/** Secondary line for a tile: how the open listings split by eligibility. */
export function tileNote(t: TypeSummary | undefined, tr: (k: MessageKey, v?: Record<string, number>) => string = (k, v) => translate('en', k, v)) {
  if (!t || t.open === 0) return tr('home.nothingOpen');
  const parts = [];
  if (t.likelyEligible) parts.push(tr('home.fitYou', { n: t.likelyEligible }));
  if (t.needDetails) parts.push(tr('home.needDetails', { n: t.needDetails }));
  if (!parts.length && t.closingIn30Days) parts.push(tr('home.closeSoon', { n: t.closingIn30Days }));
  return parts.join(' · ') || tr('home.openNow');
}

export function Home() {
  usePageTitle('Home');
  const user = useUser();
  const t = useT();
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
          <p className="faint" style={{ margin: 0 }}>{t(({ 'Good morning': 'home.morning', 'Good afternoon': 'home.afternoon', 'Good evening': 'home.evening' } as const)[greeting()])}</p>
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
            <Link to={moveLink(lead)} className="hero-link">{t('home.continue')} <IconArrowRight size={16} style={{ marginLeft: 6 }} /></Link>
          </div>
        ) : null}

        {CATEGORIES.map((c) => {
          const sum = summary.data?.types[c.type];
          const note = summary.data ? tileNote(sum, t) : '';
          return (
            <Link key={c.type} to={`/discover?type=${c.type}`} className={`tile ${c.cat}`} aria-label={`${sum ? sum.open : '…'} ${t(c.label)}. ${note}`}>
              <span className="num">{summary.loading && !summary.data ? '–' : summary.error ? '?' : sum?.open ?? 0}</span>
              <span className="tile-label">{t(c.label)}</span>
              <span className="tile-note">{summary.data ? note : ' '}</span>
            </Link>
          );
        })}

        <Link to="/sarthi" className="tile plain full" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 0 }}>
          <span className="ask-icon"><IconChat size={22} /></span>
          <span className="grow">
            <strong style={{ display: 'block', fontSize: 15 }}>{t('home.ask')}</strong>
            <span className="faint">{t('home.askExample')}</span>
          </span>
        </Link>
      </section>

      {/* ---- Second row: plan, roadmap, drafts, campus ---- */}
      <section className="bento" style={{ marginTop: 8 }} aria-label="Shortcuts">
        <Link to="/plan" className="tile plain small">
          <IconRoute size={20} />
          <span className="grow">{plan.data && plan.data.summary.unlockable > 0 ? t('home.oneSkillAway', { n: plan.data.summary.unlockable }) : t('home.plan')}</span>
        </Link>
        <Link to="/roadmap" className="tile plain small">
          <span className="num" style={{ fontSize: 18 }}>{progress ? `${progress.completed}/${progress.total}` : '0'}</span>
          <span className="grow">{t('nav.roadmap')}</span>
        </Link>
        <Link to="/drafts" className="tile plain small"><IconDoc size={20} /><span className="grow">{t('home.drafts')}</span></Link>
        {(notices.data?.length ?? 0) > 0 ? (
          <a href="#campus" className="tile plain small"><IconMegaphone size={20} /><span className="grow">{notices.data!.length} campus notice{notices.data!.length === 1 ? '' : 's'}</span></a>
        ) : (
          <Link to="/applications" className="tile plain small"><IconBookmark size={20} /><span className="grow">{t('nav.applied')}</span></Link>
        )}
      </section>

      {/* ---- Coming up ---- */}
      <section className="section">
        <div className="section-head"><h2>{t('home.comingUp')}</h2><Link to="/applications">{t('home.all')}</Link></div>
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
        ) : <p className="faint">{t('home.noDates')}</p>}
      </section>

      {/* ---- Matched for you ---- */}
      <section className="section">
        <div className="section-head"><h2>{t('home.matched')}</h2><Link to="/discover">{t('home.seeAll')}</Link></div>
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
