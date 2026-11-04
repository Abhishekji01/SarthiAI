import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { openExternal } from '../lib/platform';
import { formatDate, relativeDays, TYPE_LABEL } from '../lib/format';
import type { PlanOpportunity, PlanStep } from '../lib/types';
import { Empty, ErrorState, Skeleton, TopBar, useToast } from '../components/ui';
import { IconCheck, IconExternal, IconRoute, IconUser } from '../components/icons';

/**
 * Gap-to-plan: what stands between the student and open opportunities, as a dated 90-day plan.
 * Everything here comes from the server's deterministic analysis — no AI, nothing invented.
 */
export function Plan() {
  const navigate = useNavigate();
  const toast = useToast();
  const { data: plan, error, loading, reload } = useAsync(() => api.plan(), []);
  const [adding, setAdding] = useState(false);

  const addToRoadmap = async () => {
    setAdding(true);
    try {
      const r = await api.addPlanToRoadmap();
      toast(r.added ? `Added ${r.added} step${r.added === 1 ? '' : 's'} to your roadmap` : 'Already on your roadmap');
      navigate('/roadmap');
    } catch (e) { toast((e as Error).message); } finally { setAdding(false); }
  };

  return (
    <div className="page">
      <TopBar title="Your 90-day plan" kicker="What stands between you and more opportunities" back />
      {loading && !plan ? <Skeleton count={4} /> : error ? <ErrorState error={error} onRetry={reload} /> : !plan ? null : (
        <>
          <section className="card lead">
            <p className="kicker">Gap to plan</p>
            <h2 style={{ color: 'inherit' }}>{plan.headline}</h2>
            <p style={{ opacity: 0.9, margin: 0 }} className="small">
              {plan.summary.readyNow} open listing{plan.summary.readyNow === 1 ? '' : 's'} already fit your skills · {plan.summary.unlockable} more are one skill away
            </p>
            {plan.steps.length > 0 && (
              <button className="btn on-lead" style={{ marginTop: 14 }} onClick={addToRoadmap} disabled={adding}>
                <IconRoute size={18} /> {adding ? 'Adding…' : 'Add this plan to my roadmap'}
              </button>
            )}
          </section>

          {plan.steps.length === 0 ? (
            <Empty title="Nothing to fix right now">No skill gaps among open opportunities. <Link to="/discover">Browse opportunities</Link></Empty>
          ) : (
            <section className="section">
              <h2>Step by step</h2>
              <ol className="list card" style={{ padding: '4px 16px' }}>
                {plan.steps.map((s, i) => <StepRow key={i} step={s} index={i} />)}
              </ol>
            </section>
          )}

          {plan.skills.length > 0 && (
            <section className="section">
              <h2>Skills that open the most doors</h2>
              <p className="faint" style={{ marginTop: -4 }}>Counted from open, verified listings that fit your goal and that you are otherwise eligible for.</p>
              <div className="stack">
                {plan.skills.slice(0, 6).map((s) => (
                  <article key={s.id} className="card">
                    <div className="row" style={{ alignItems: 'flex-start' }}>
                      <div className="grow">
                        <h3>{s.label}</h3>
                        <p className="small muted" style={{ margin: 0 }}>
                          {s.unlocks > 0 && <><strong>Unlocks {s.unlocks}</strong> (the last thing missing) · </>}
                          required by {s.required}{s.strengthens ? ` · preferred by ${s.strengthens}` : ''}
                          {s.fitsGoal ? ` · ${s.fitsGoal} fit your goal` : ''}
                        </p>
                      </div>
                      <span className="tag">≈ {s.effortWeeks} wk</span>
                    </div>
                    <OppList items={s.opportunities.slice(0, 3)} />
                    {s.resources.length > 0 && (
                      <div className="chips" style={{ marginTop: 8 }}>
                        {s.resources.map((r) => <button key={r.id} className="chip" onClick={() => openExternal(r.url)}><IconExternal size={14} /> {r.title}</button>)}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="section">
            <div className="card soft small">
              <p style={{ margin: 0 }}>
                Not in this plan: {plan.summary.notFixable} listing{plan.summary.notFixable === 1 ? '' : 's'} need a different degree, branch, batch or state;
                {' '}{plan.summary.roleMismatch} are a different kind of role from your goal; {plan.summary.restricted} are limited to a specific group.
              </p>
              <p className="faint" style={{ margin: '8px 0 0' }}>{plan.note}</p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function StepRow({ step: s, index }: { step: PlanStep; index: number }) {
  return (
    <li style={{ padding: '14px 0' }}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <span className="opp-mark" style={{ width: 32, height: 32, fontSize: 14 }} aria-hidden>
          {s.kind === 'profile' ? <IconUser size={16} /> : s.kind === 'experience' ? <IconCheck size={16} /> : index + 1}
        </span>
        <div className="grow">
          <strong>{s.title}</strong>
          {s.startsAt && s.targetDate && (
            <span className="faint"> · {formatDate(s.startsAt, { day: 'numeric', month: 'short' })} – {formatDate(s.targetDate, { day: 'numeric', month: 'short' })}</span>
          )}
          <p className="small muted" style={{ margin: '2px 0 0' }}>{s.detail}</p>
          {s.effortEstimate && <p className="tiny faint" style={{ margin: '2px 0 0' }}>{s.effortEstimate}</p>}
          {s.kind === 'profile' && <Link className="btn small secondary" style={{ marginTop: 8 }} to="/profile/edit">Update profile</Link>}
          {s.resources && s.resources.length > 0 && (
            <div className="chips" style={{ marginTop: 8 }}>
              {s.resources.map((r) => <button key={r.id} className="chip" onClick={() => openExternal(r.url)}><IconExternal size={14} /> {r.title} · {r.cost}</button>)}
            </div>
          )}
          {s.applyTo && s.applyTo.length > 0 && <><p className="kicker" style={{ margin: '10px 0 2px' }}>Then apply to</p><OppList items={s.applyTo.slice(0, 3)} /></>}
        </div>
      </div>
    </li>
  );
}

function OppList({ items }: { items: PlanOpportunity[] }) {
  return (
    <ul className="list" style={{ marginTop: 6 }}>
      {items.map((o) => (
        <li key={o.id}>
          <Link to={`/opportunity/${o.id}`} className="row small" style={{ padding: '6px 0', color: 'inherit', textDecoration: 'none' }}>
            <span className="grow">{o.title} <span className="faint">· {o.organization} · {TYPE_LABEL[o.opportunityType]}</span></span>
            {o.fitsGoal && <span className="tag jade">Your goal</span>}
            {o.deadline && o.daysLeft != null && o.daysLeft >= 0 && <span className="tag amber">{relativeDays(o.deadline)}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
