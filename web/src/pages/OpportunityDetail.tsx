import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useSession } from '../lib/session';
import { openExternal, reminderPermission, requestReminderPermission, tap } from '../lib/platform';
import { syncReminders } from '../lib/reminders';
import { AVAILABILITY_LABEL, formatDate, formatMoney, fromDateInput, OVERALL_LABEL, STATUS_LABEL, toDateInput, TYPE_LABEL } from '../lib/format';
import { APPLICATION_STATUSES, type ApplicationStatus, type EligibilityResult, type Opportunity } from '../lib/types';
import { DeadlineTag, VerificationTag } from '../components/OpportunityRow';
import { ErrorState, Field, Sheet, Skeleton, TopBar, useToast } from '../components/ui';
import { IconBookmark, IconCheck, IconDoc, IconExternal, IconSpark, IconX } from '../components/icons';

export function OpportunityDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: o, error, loading, reload, setData } = useAsync(() => api.opportunity(id), [id]);
  const [trackOpen, setTrackOpen] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);

  if (loading && !o) return <div className="page"><TopBar title="" back /><Skeleton count={4} /></div>;
  if (error || !o) return <div className="page"><TopBar title="Opportunity" back /><ErrorState error={error ?? new Error('Not found')} onRetry={reload} /></div>;

  const toggleSave = async () => {
    tap();
    const was = o.isSaved;
    setData({ ...o, isSaved: !was });
    try {
      if (was) await api.unsave(o.id); else await api.save(o.id);
      toast(was ? 'Removed from saved' : 'Saved');
    } catch (e) {
      setData({ ...o, isSaved: was });
      toast((e as Error).message);
    }
  };

  const money = [o.stipend && ['Stipend', formatMoney(o.stipend)], o.award && ['Award', formatMoney(o.award)]].filter(Boolean) as [string, string | null][];
  const facts: [string, string][] = [
    ['Deadline', o.deadline ? formatDate(o.deadline) : 'Not published'],
    ['Status', AVAILABILITY_LABEL[o.availability]],
    ...money.map(([k, v]) => [k, v ?? 'Not stated'] as [string, string]),
    ...(o.duration ? [['Duration', o.duration] as [string, string]] : []),
    ['Mode', o.workMode === 'not_applicable' ? 'Not applicable' : o.workMode === 'unknown' ? 'Not stated' : o.workMode[0].toUpperCase() + o.workMode.slice(1)],
    ...(o.location?.description || o.location?.city ? [['Where', o.location.description ?? [o.location.city, o.location.state].filter(Boolean).join(', ')] as [string, string]] : o.location?.isNationwide ? [['Where', 'Across India'] as [string, string]] : []),
    ...(o.eligibleYears.length ? [['Years', o.eligibleYears.map((y) => `Year ${y}`).join(', ')] as [string, string]] : []),
    ...(o.eligibleDegrees.length ? [['Degrees', o.eligibleDegrees.join(', ')] as [string, string]] : []),
    ...(o.minimumCGPA != null ? [['Min. CGPA', String(o.minimumCGPA)] as [string, string]] : []),
  ];

  return (
    <div className="page">
      <TopBar title="" back actions={
        <button className={`icon-btn ${o.isSaved ? 'active' : ''}`} aria-label={o.isSaved ? 'Unsave' : 'Save'} aria-pressed={o.isSaved} onClick={toggleSave}><IconBookmark size={18} filled={o.isSaved} /></button>
      } />
      <p className="kicker">{TYPE_LABEL[o.opportunityType]} · {o.organization}</p>
      <h1>{o.title}</h1>
      <div className="opp-meta" style={{ marginBottom: 16 }}>
        <DeadlineTag o={o} />
        <VerificationTag o={o} />
        {o.collegeId && <span className="tag accent">Your campus</span>}
        {o.tracked && <span className="tag accent">Tracked · {STATUS_LABEL[o.tracked.status]}</span>}
      </div>

      <div className="row wrap" style={{ marginBottom: 20 }}>
        <button className="btn" onClick={() => openExternal(o.applicationUrl ?? o.sourceUrl)}><IconExternal size={18} /> {o.applicationUrl ? 'Apply on official site' : 'Official source'}</button>
        {o.tracked
          ? <Link className="btn secondary" to="/applications">View in tracker</Link>
          : <button className="btn secondary" onClick={() => setTrackOpen(true)}>Track application</button>}
      </div>
      <p className="tiny faint" style={{ marginTop: -12 }}>Opening the official site never marks you as applied — you update your tracker yourself.</p>

      {o.summary && (
        <section className="section">
          <p className="kicker">In short {o.summarySource === 'ai' ? '· AI summary' : ''}</p>
          <p>{o.summary}</p>
        </section>
      )}

      <dl className="facts section">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {o.deadlineNote && <p className="quote">{o.deadlineNote}</p>}

      {o.match && <WhyThis o={o} />}
      <EligibilityReport o={o} />

      {o.officialDescription && (
        <section className="section">
          <h2>From the official source</h2>
          <p className="muted prewrap small">{o.officialDescription}</p>
        </section>
      )}

      {(o.requiredSkills.length > 0 || o.preferredSkills.length > 0) && (
        <section className="section">
          <h2>Skills</h2>
          <div className="chips">
            {o.requiredSkills.map((s) => <span key={s} className="tag accent">{s}</span>)}
            {o.preferredSkills.map((s) => <span key={s} className="tag">{s} (preferred)</span>)}
          </div>
        </section>
      )}

      {o.requiredDocuments.length > 0 && (
        <section className="section">
          <h2>Documents you’ll need</h2>
          <ul className="list card" style={{ padding: '2px 16px' }}>
            {o.requiredDocuments.map((d) => <li key={d} className="row small" style={{ padding: '10px 0' }}><IconDoc size={18} style={{ color: 'var(--ink-3)', flexShrink: 0 }} /> {d}</li>)}
          </ul>
        </section>
      )}

      <section className="section">
        <h2>Get help</h2>
        <div className="grid-2">
          <button className="card soft row" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => navigate(`/sarthi?about=${o.id}&title=${encodeURIComponent(o.title)}`)}>
            <IconSpark /><span className="grow"><strong>Ask Sarthi about this</strong><br /><span className="faint">Eligibility, documents, how to prepare</span></span>
          </button>
          <button className="card soft row" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setDraftOpen(true)}>
            <IconDoc /><span className="grow"><strong>Draft an email or cover letter</strong><br /><span className="faint">You review before using it</span></span>
          </button>
        </div>
      </section>

      <section className="section">
        <h2>Source & verification</h2>
        <div className="card soft small">
          <p><strong>{o.verificationStatus === 'verified' ? 'Verified' : 'Not yet verified'}</strong>{o.lastVerifiedAt && ` · checked ${formatDate(o.lastVerifiedAt)}`}{o.datesRefreshedAt && ` · dates refreshed ${formatDate(o.datesRefreshedAt)}`}</p>
          {o.verificationNotes && <p className="muted">{o.verificationNotes}</p>}
          {o.isStale && <p style={{ color: 'var(--amber)' }}>Last verified over 30 days ago — details may have changed.</p>}
          <div className="stack">
            {[{ label: 'Official source', url: o.sourceUrl }, ...o.additionalSources].map((s) => (
              <button key={s.url} className="link-btn row" onClick={() => openExternal(s.url)}><IconExternal size={16} /> {s.label}</button>
            ))}
          </div>
        </div>
      </section>

      <TrackSheet o={o} open={trackOpen} onClose={() => setTrackOpen(false)} onTracked={(appId, status) => { setData({ ...o, tracked: { id: appId, status, archived: false } }); toast('Added to your tracker'); }} />
      <DraftSheet o={o} open={draftOpen} onClose={() => setDraftOpen(false)} />
    </div>
  );
}

function WhyThis({ o }: { o: Opportunity }) {
  const m = o.match!;
  const [ai, setAi] = useState<{ explanation: string; nextSteps: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const explain = async () => {
    setBusy(true);
    setErr(null);
    try { setAi(await api.explainMatch(o.id)); } catch (e) { setErr(e instanceof ApiError && e.isAIUnavailable ? 'Sarthi’s AI explanation is unavailable right now — the factors above are computed without AI.' : (e as Error).message); } finally { setBusy(false); }
  };
  return (
    <section className="section">
      <div className="section-head">
        <h2>Why this opportunity?</h2>
        {!m.hardBlocked && <span className="row" title={m.scoreLabel}><span className="score">{m.score}</span><span className="faint">/100{m.confidence ? ` · ${m.confidence} confidence` : ''}</span></span>}
      </div>
      <div className="card">
        {m.factors.length === 0 && <p className="faint">Not enough profile information to explain the fit yet.</p>}
        {m.factors.map((f, i) => (
          <div key={i} className="factor"><span className={`dot ${f.positive ? 'pos' : 'neg'}`}>{f.positive ? '+' : '–'}</span><span>{f.detail}</span></div>
        ))}
        <p className="tiny faint" style={{ marginTop: 10, marginBottom: 0 }}>{m.scoreLabel}.</p>
        <hr className="divider" />
        {ai ? (
          <div>
            <p className="kicker">Sarthi explains · AI</p>
            <p className="small">{ai.explanation}</p>
            {ai.nextSteps.length > 0 && <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>{ai.nextSteps.map((s) => <li key={s}>{s}</li>)}</ul>}
          </div>
        ) : (
          <button className="btn small secondary" onClick={explain} disabled={busy}><IconSpark size={16} /> {busy ? 'Thinking…' : 'Explain in plain words'}</button>
        )}
        {err && <p className="small" style={{ color: 'var(--amber)', marginTop: 8 }}>{err}</p>}
      </div>
    </section>
  );
}

function EligibilityReport({ o }: { o: Opportunity }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<EligibilityResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    api.checkEligibility(o.id, answers).then((r) => live && setResult(r)).catch((e) => live && setError(e));
    return () => { live = false; };
  }, [open, answers, o.id]);

  const overall = result ? OVERALL_LABEL[result.overall] : null;
  return (
    <section className="section">
      <button className="card row" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }} onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="opp-mark" style={{ background: 'var(--jade-soft)', color: 'var(--jade)' }}><IconCheck /></span>
        <span className="grow"><strong>What am I missing?</strong><br /><span className="faint">Check each official criterion against your profile</span></span>
        <span aria-hidden>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="card" style={{ marginTop: 8 }}>
          {error && <ErrorState error={error} />}
          {!result && !error && <Skeleton count={2} height={50} />}
          {result && overall && (
            <>
              <div className={`notice ${overall.tone === 'muted' ? '' : overall.tone}`}><strong>{overall.text}</strong></div>
              <p className="faint" style={{ marginTop: 8 }}>
                {result.counts.met} met · {result.counts.unmet} not met · {result.counts.unknown} to confirm
              </p>
              <ul className="list">
                {result.criteria.map((c) => (
                  <li key={c.key} className="crit">
                    <div className="crit-head">
                      <span className={`crit-status ${c.status}`} aria-label={c.status}>{c.status === 'met' ? <IconCheck size={14} /> : c.status === 'unmet' ? <IconX size={14} /> : '?'}</span>
                      <div className="grow">
                        <strong className="small">{c.requirement}</strong>{!c.mandatory && <span className="tag" style={{ marginLeft: 6 }}>Optional</span>}
                        <p className="small muted" style={{ margin: '2px 0 0' }}>{c.explanation}</p>
                        {c.nextStep && <p className="small" style={{ margin: '4px 0 0', color: 'var(--accent)' }}>→ {c.nextStep}</p>}
                        {c.sourceExcerpt && <p className="quote">“{c.sourceExcerpt}”</p>}
                        {c.kind === 'self_declared' && (
                          <div className="row" style={{ marginTop: 8 }}>
                            <span className="small faint">Does this apply to you?</span>
                            {[true, false].map((v) => (
                              <button key={String(v)} className={`chip ${answers[c.key] === v ? 'on' : ''}`} aria-pressed={answers[c.key] === v}
                                onClick={() => setAnswers((a) => { const n = { ...a }; if (n[c.key] === v) delete n[c.key]; else n[c.key] = v; return n; })}>
                                {answers[c.key] === v && <IconCheck size={14} />} {v ? 'Yes' : 'No'}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {result.caveats.map((c) => <div key={c.code} className="notice amber" style={{ marginTop: 8 }}>{c.message}</div>)}
              <p className="tiny faint" style={{ marginTop: 10 }}>{result.disclaimer} Your Yes/No answers are used for this check only and are not saved.</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function TrackSheet({ o, open, onClose, onTracked }: { o: Opportunity; open: boolean; onClose: () => void; onTracked: (id: string, s: ApplicationStatus) => void }) {
  const { user } = useSession();
  const [status, setStatus] = useState<ApplicationStatus>('interested');
  const [nextAction, setNextAction] = useState('');
  const [due, setDue] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const app = await api.createApplication({ opportunityId: o.id, status, nextAction: nextAction || undefined, nextActionDue: fromDateInput(due), notes: notes || undefined });
      // Ask for reminder permission the first time something dated is tracked.
      if ((o.deadline || due) && (await reminderPermission()) === 'prompt') await requestReminderPermission();
      if (user) syncReminders(user).catch(() => {});
      onTracked(app.id, app.status);
      onClose();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Track application">
      <p className="small muted">Adds “{o.title}” to your private tracker{o.deadline ? ` with its deadline (${formatDate(o.deadline)})` : ''}. It does not apply anywhere.</p>
      <Field label="Status">
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as ApplicationStatus)}>
          {APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </Field>
      <Field label="Next action (optional)"><input className="input" value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="e.g. Ask HoD for recommendation letter" maxLength={300} /></Field>
      <Field label="Next action due (optional)" hint="You’ll get a reminder that morning."><input className="input" type="date" value={due} min={toDateInput(new Date().toISOString())} onChange={(e) => setDue(e.target.value)} /></Field>
      <Field label="Notes (optional)"><textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 80 }} /></Field>
      {err && <div className="notice coral" style={{ marginBottom: 12 }}>{err}</div>}
      <button className="btn block" onClick={submit} disabled={busy}>{busy ? 'Adding…' : 'Add to tracker'}</button>
    </Sheet>
  );
}

function DraftSheet({ o, open, onClose }: { o: Opportunity; open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [kind, setKind] = useState<'email' | 'cover_letter'>('email');
  const [tone, setTone] = useState('formal');
  const [recipient, setRecipient] = useState('');
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      const d = kind === 'email'
        ? await api.draftEmail({ opportunityId: o.id, tone, recipientName: recipient || undefined, extraContext: extra || undefined })
        : await api.generateResume({ kind: 'cover_letter', opportunityId: o.id, extraContext: extra || undefined });
      navigate(`/drafts/${d.id}`);
    } catch (e) {
      setErr(e instanceof ApiError && e.isAIUnavailable ? `${e.message} You can still write a draft yourself in Drafts.` : (e as Error).message);
    } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Draft with Sarthi">
      <div className="chips" style={{ marginBottom: 14 }}>
        <button className={`chip ${kind === 'email' ? 'on' : ''}`} onClick={() => setKind('email')}>Email</button>
        <button className={`chip ${kind === 'cover_letter' ? 'on' : ''}`} onClick={() => setKind('cover_letter')}>Cover letter</button>
      </div>
      {kind === 'email' && (
        <div className="grid-2">
          <Field label="Tone"><select className="input" value={tone} onChange={(e) => setTone(e.target.value)}><option value="formal">Formal</option><option value="warm">Warm</option><option value="concise">Concise</option></select></Field>
          <Field label="Recipient (optional)"><input className="input" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="e.g. Dr. Rao" /></Field>
        </div>
      )}
      <Field label="Anything to include? (optional)"><textarea className="input" value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={600} placeholder="e.g. Mention my CTF project" style={{ minHeight: 80 }} /></Field>
      <p className="tiny faint">Sarthi uses only your profile and this listing. Missing details appear as [ADD: …] placeholders for you to fill in.</p>
      {err && <div className="notice amber" style={{ marginBottom: 12 }}>{err}</div>}
      <button className="btn block" onClick={go} disabled={busy}><IconSpark size={16} /> {busy ? 'Writing…' : 'Generate draft'}</button>
    </Sheet>
  );
}
