import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useUser } from '../lib/session';
import { openExternal } from '../lib/platform';
import { formatDate, fromDateInput, toDateInput } from '../lib/format';
import type { Milestone, MilestoneStatus, Roadmap } from '../lib/types';
import { Empty, ErrorState, Field, Progress, Sheet, Skeleton, TopBar, useToast } from '../components/ui';
import { IconExternal, IconPlus, IconRoute, IconChat, IconTrash } from '../components/icons';

const STATUS_TEXT: Record<MilestoneStatus, string> = { not_started: 'Not started', in_progress: 'In progress', paused: 'Paused', completed: 'Completed' };
const STATUS_TONE: Record<MilestoneStatus, string> = { not_started: 'muted', in_progress: 'accent', paused: 'amber', completed: 'jade' };

export function RoadmapPage() {
  const user = useUser();
  const toast = useToast();
  const { data: roadmap, error, loading, reload, setData } = useAsync(() => api.roadmap(), []);
  const [genOpen, setGenOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const updateMilestone = async (m: Milestone, body: Record<string, unknown>) => {
    try { setData(await api.updateMilestone(m.id, body)); } catch (e) { toast((e as Error).message); }
  };
  const remove = async (m: Milestone) => {
    if (!confirm(`Delete “${m.title}”?`)) return;
    try { setData(await api.deleteMilestone(m.id)); } catch (e) { toast((e as Error).message); }
  };

  return (
    <div className="page">
      <TopBar title="Roadmap" kicker="Your plan" actions={roadmap ? <button className="icon-btn" aria-label="Add milestone" onClick={() => setAddOpen(true)}><IconPlus /></button> : undefined} />
      {loading && !roadmap ? <Skeleton count={3} /> : error ? <ErrorState error={error} onRetry={reload} /> : !roadmap ? (
        <Empty icon={<IconRoute size={40} />} title="No roadmap yet">
          <p>Turn your goal into milestones you can start this week.</p>
          <div className="row wrap" style={{ justifyContent: 'center', marginTop: 12 }}>
            <Link className="btn" to="/plan"><IconRoute size={16} /> See your gap plan</Link>
            <button className="btn secondary" onClick={() => setGenOpen(true)}><IconChat size={16} /> Build with Sarthi</button>
            <button className="btn ghost" onClick={() => setAddOpen(true)}>Add a milestone myself</button>
          </div>
        </Empty>
      ) : (
        <>
          <section className="card">
            <p className="faint">Goal{roadmap.generatedBy === 'ai' ? ' · plan drafted by Sarthi' : ''}</p>
            <h2>{roadmap.goal}</h2>
            {roadmap.summary && <p className="small muted">{roadmap.summary}</p>}
            <div className="row"><div className="grow"><Progress value={roadmap.progress.completed} total={roadmap.progress.total} /></div><span className="faint">{roadmap.progress.completed} of {roadmap.progress.total} done</span></div>
            <div className="row wrap" style={{ marginTop: 10, gap: 16 }}>
              <Link className="link-btn small" to="/plan">See your 90-day gap plan</Link>
              <button className="link-btn small" onClick={() => setGenOpen(true)}>Rebuild with Sarthi</button>
            </div>
          </section>
          <div className="stack" style={{ marginTop: 16 }}>
            {roadmap.milestones.map((m, i) => <MilestoneCard key={m.id} m={m} index={i} onUpdate={(b) => updateMilestone(m, b)} onDelete={() => remove(m)} />)}
          </div>
        </>
      )}
      <GenerateSheet open={genOpen} onClose={() => setGenOpen(false)} defaultGoal={roadmap?.goal ?? user.profile.careerGoal ?? ''} onDone={(r) => { setData(r); toast('Roadmap ready'); }} />
      <AddSheet open={addOpen} onClose={() => setAddOpen(false)} onDone={(r) => setData(r)} />
    </div>
  );
}

function MilestoneCard({ m, index, onUpdate, onDelete }: { m: Milestone; index: number; onUpdate: (b: Record<string, unknown>) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(m.status === 'in_progress');
  return (
    <article className="card" style={m.status === 'completed' ? { opacity: 0.75 } : undefined}>
      <button className="row" style={{ width: '100%', background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', alignItems: 'flex-start' }} onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="opp-mark" style={{ width: 34, height: 34, fontSize: 15 }}>{index + 1}</span>
        <span className="grow">
          <strong style={m.status === 'completed' ? { textDecoration: 'line-through' } : undefined}>{m.title}</strong>
          <span className="opp-meta" style={{ marginTop: 6 }}>
            <span className={`tag ${STATUS_TONE[m.status]}`}>{STATUS_TEXT[m.status]}</span>
            <span className={`tag ${m.priority === 'high' ? 'coral' : m.priority === 'medium' ? 'amber' : ''}`}>{m.priority} priority</span>
            {m.targetDate && <span className="tag">By {formatDate(m.targetDate, { day: 'numeric', month: 'short' })}</span>}
            {m.effortEstimate && <span className="tag">≈ {m.effortEstimate}</span>}
            {m.source === 'plan' && <span className="tag accent">From your gap plan</span>}
          </span>
        </span>
      </button>
      {open && (
        <div style={{ marginTop: 12 }}>
          {m.purpose && <p className="small muted">{m.purpose}</p>}
          {m.steps.length > 0 && <><p className="faint">Steps</p><ol className="small" style={{ paddingLeft: 20, marginTop: 0 }}>{m.steps.map((s) => <li key={s}>{s}</li>)}</ol></>}
          {m.verifiedResources.length > 0 && (
            <><p className="faint">Verified resources</p>
              <div className="stack" style={{ marginBottom: 10 }}>{m.verifiedResources.map((r) => (
                <button key={r.id} className="link-btn row small" onClick={() => openExternal(r.url)}><IconExternal size={14} /> {r.title} · {r.provider} ({r.cost})</button>
              ))}</div></>
          )}
          {m.suggestedResources.length > 0 && (
            <><p className="faint">Ideas from Sarthi · not verified</p>
              <ul className="small muted" style={{ paddingLeft: 18, marginTop: 0 }}>{m.suggestedResources.map((s) => <li key={s.title}>{s.title}{s.note ? ` — ${s.note}` : ''}</li>)}</ul></>
          )}
          {m.projectIdeas.length > 0 && <><p className="faint">Project ideas</p><ul className="small" style={{ paddingLeft: 18, marginTop: 0 }}>{m.projectIdeas.map((s) => <li key={s}>{s}</li>)}</ul></>}
          <div className="row wrap" style={{ marginTop: 8 }}>
            {m.status !== 'in_progress' && m.status !== 'completed' && <button className="btn small" onClick={() => onUpdate({ status: 'in_progress' })}>Start</button>}
            {m.status === 'in_progress' && <button className="btn small" onClick={() => onUpdate({ status: 'completed' })}>Mark complete</button>}
            {m.status === 'in_progress' && <button className="btn small ghost" onClick={() => onUpdate({ status: 'paused' })}>Pause</button>}
            {m.status === 'completed' && <button className="btn small ghost" onClick={() => onUpdate({ status: 'in_progress' })}>Reopen</button>}
            <select className="input" style={{ width: 'auto', minHeight: 34, padding: '4px 34px 4px 10px', fontSize: 14 }} value={m.priority} onChange={(e) => onUpdate({ priority: e.target.value })} aria-label="Priority">
              <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
            </select>
            <input className="input" type="date" style={{ width: 'auto', minHeight: 34, padding: '4px 10px', fontSize: 14 }} value={toDateInput(m.targetDate)} onChange={(e) => onUpdate({ targetDate: fromDateInput(e.target.value) })} aria-label="Target date" />
            <button className="icon-btn" aria-label="Delete milestone" onClick={onDelete}><IconTrash size={16} /></button>
          </div>
        </div>
      )}
    </article>
  );
}

function GenerateSheet({ open, onClose, defaultGoal, onDone }: { open: boolean; onClose: () => void; defaultGoal: string; onDone: (r: Roadmap) => void }) {
  const [goal, setGoal] = useState(defaultGoal);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try { onDone(await api.generateRoadmap(goal.trim())); onClose(); } catch (e) {
      setErr(e instanceof ApiError && e.isAIUnavailable ? `${e.message} You can add milestones yourself meanwhile.` : (e as Error).message);
    } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Build a roadmap with Sarthi">
      <Field label="Your goal" hint="Sarthi plans 3–6 milestones from your profile. Only checked resources are marked verified. Your current roadmap is archived.">
        <input className="input" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Land a cybersecurity internship by summer" maxLength={300} />
      </Field>
      {err && <div className="notice amber" style={{ marginBottom: 12 }}>{err}</div>}
      <button className="btn block" onClick={go} disabled={busy || goal.trim().length < 3}><IconChat size={16} /> {busy ? 'Planning… (up to 30s)' : 'Generate roadmap'}</button>
    </Sheet>
  );
}

function AddSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (r: Roadmap) => void }) {
  const [title, setTitle] = useState('');
  const [steps, setSteps] = useState('');
  const [priority, setPriority] = useState('medium');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      onDone(await api.addMilestone({ title: title.trim(), steps: steps.split('\n').map((s) => s.trim()).filter(Boolean), priority, targetDate: fromDateInput(date) }));
      setTitle(''); setSteps(''); setDate('');
      onClose();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Add a milestone">
      <Field label="Milestone"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Finish OWASP Top 10 labs" maxLength={160} /></Field>
      <Field label="Steps (one per line, optional)"><textarea className="input" value={steps} onChange={(e) => setSteps(e.target.value)} style={{ minHeight: 90 }} /></Field>
      <div className="grid-2">
        <Field label="Priority"><select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></Field>
        <Field label="Target date (optional)"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      {err && <div className="notice coral" style={{ marginBottom: 12 }}>{err}</div>}
      <button className="btn block" onClick={go} disabled={busy || !title.trim()}>{busy ? 'Adding…' : 'Add milestone'}</button>
    </Sheet>
  );
}
