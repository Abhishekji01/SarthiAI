import { useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useUser } from '../lib/session';
import { openExternal } from '../lib/platform';
import { syncReminders } from '../lib/reminders';
import { formatDate, fromDateInput, relativeDays, STATUS_LABEL, toDateInput } from '../lib/format';
import { APPLICATION_STATUSES, type Application, type ApplicationStatus } from '../lib/types';
import { Empty, ErrorState, Field, Sheet, Skeleton, TopBar, useToast } from '../components/ui';
import { IconBriefcase, IconExternal, IconPlus } from '../components/icons';
import { usePageTitle } from '../lib/usePageTitle';

const GROUPS: { title: string; statuses: ApplicationStatus[] }[] = [
  { title: 'Preparing', statuses: ['interested', 'preparing', 'ready_to_apply'] },
  { title: 'In progress', statuses: ['applied', 'assessment', 'interview'] },
  { title: 'Decided', statuses: ['offer', 'rejected', 'withdrawn'] },
];
const TONE: Partial<Record<ApplicationStatus, string>> = { ready_to_apply: 'amber', applied: 'accent', assessment: 'accent', interview: 'accent', offer: 'jade', rejected: 'muted', withdrawn: 'muted' };

export function Applications() {
  usePageTitle('Applied');
  const user = useUser();
  const toast = useToast();
  const [archived, setArchived] = useState(false);
  const { data, error, loading, reload, setData } = useAsync(() => api.applications(archived), [archived]);
  const [editing, setEditing] = useState<Application | null>(null);
  const [adding, setAdding] = useState(false);
  const [view, setViewState] = useState<'list' | 'board'>(() => { try { return localStorage.getItem('sarthi.trackerView') === 'board' ? 'board' : 'list'; } catch { return 'list'; } });
  const setView = (v: 'list' | 'board') => { setViewState(v); try { localStorage.setItem('sarthi.trackerView', v); } catch { /* ignore */ } };
  const [outcomeFor, setOutcomeFor] = useState<Application | null>(null);
  const move = async (a: Application, status: ApplicationStatus) => {
    if (a.status === status) return;
    // Optimistic: the card moves at once; the server keeps the status history.
    setData((prev) => (prev ?? []).map((x) => (x.id === a.id ? { ...x, status } : x)));
    const u = await save(a.id, { status });
    if (u) toast(`Moved to ${STATUS_LABEL[status]}`);
    else reload();
  };

  const save = async (id: string, body: Partial<Application>) => {
    try {
      const updated = await api.updateApplication(id, body);
      setData((prev) => (prev ?? []).map((a) => (a.id === id ? updated : a)).filter((a) => a.archived === archived));
      syncReminders(user).catch(() => {});
      return updated;
    } catch (e) { toast((e as Error).message); return null; }
  };

  return (
    <div className="page">
      <TopBar title="Applications" kicker="Your tracker" actions={<button className="icon-btn" aria-label="Add external application" onClick={() => setAdding(true)}><IconPlus /></button>} />
      <div className="row between wrap" style={{ marginBottom: 14, gap: 8 }}>
        <div className="chips">
          <button className={`chip ${!archived ? 'on' : ''}`} aria-pressed={!archived} onClick={() => setArchived(false)}>Active</button>
          <button className={`chip ${archived ? 'on' : ''}`} aria-pressed={archived} onClick={() => setArchived(true)}>Archived</button>
        </div>
        <div className="chips" role="group" aria-label="View">
          <button className={`chip ${view === 'list' ? 'on' : ''}`} aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button>
          <button className={`chip ${view === 'board' ? 'on' : ''}`} aria-pressed={view === 'board'} onClick={() => setView('board')}>Board</button>
        </div>
      </div>
      {loading && !data ? <Skeleton /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.length ? (
        <Empty icon={<IconBriefcase size={40} />} title={archived ? 'Nothing archived' : 'No applications tracked yet'}>
          {!archived && <>Open an opportunity and tap <strong>Track application</strong>, or add one from outside SarthiAI with +. <br /><Link to="/discover">Browse opportunities</Link></>}
        </Empty>
      ) : view === 'board' ? (
        <Board items={data} onOpen={setEditing} onMove={(a, col) => (col.statuses.includes(a.status) ? undefined : col.key === 'outcome' ? setOutcomeFor(a) : move(a, col.drop))} onSetStatus={move} />
      ) : GROUPS.map((g) => {
        const items = data.filter((a) => g.statuses.includes(a.status));
        if (!items.length) return null;
        return (
          <section key={g.title} className="section" style={{ marginTop: 18 }}>
            <h2>{g.title} <span className="faint">({items.length})</span></h2>
            <div className="stack">
              {items.map((a) => (
                <button key={a.id} className="card" style={{ width: '100%', textAlign: 'left', cursor: 'pointer', display: 'block' }} onClick={() => setEditing(a)}>
                  <div className="row" style={{ alignItems: 'flex-start' }}>
                    <div className="grow">
                      <h3>{a.title}</h3>
                      {a.organization && <p className="faint" style={{ margin: 0 }}>{a.organization}</p>}
                    </div>
                    <span className={`tag ${TONE[a.status] ?? ''}`}>{STATUS_LABEL[a.status]}</span>
                  </div>
                  <div className="opp-meta">
                    {a.deadline && <span className="tag">Deadline {formatDate(a.deadline, { day: 'numeric', month: 'short' })} · {relativeDays(a.deadline)}</span>}
                    {a.nextAction && <span className={`tag ${a.nextActionDue && new Date(a.nextActionDue) < new Date() ? 'coral' : 'amber'}`}>Next: {a.nextAction}{a.nextActionDue ? ` · ${relativeDays(a.nextActionDue)}` : ''}</span>}
                  </div>
                </button>
              ))}
            </div>
          </section>
        );
      })}

      {editing && <EditSheet a={editing} onClose={() => setEditing(null)} onSave={async (b) => { const u = await save(editing.id, b); if (u) { setEditing(null); toast('Saved'); } }}
        onDelete={async () => {
          if (!confirm('Delete this application from your tracker?')) return;
          try { await api.deleteApplication(editing.id); setData((p) => (p ?? []).filter((x) => x.id !== editing.id)); setEditing(null); toast('Deleted'); } catch (e) { toast((e as Error).message); }
        }} />}
      <Sheet open={Boolean(outcomeFor)} onClose={() => setOutcomeFor(null)} title="What was the outcome?">
        <div className="stack">
          {(['offer', 'rejected', 'withdrawn'] as ApplicationStatus[]).map((st) => (
            <button key={st} className="btn block secondary" onClick={() => { if (outcomeFor) move(outcomeFor, st); setOutcomeFor(null); }}>{STATUS_LABEL[st]}</button>
          ))}
        </div>
      </Sheet>
      <AddSheet open={adding} onClose={() => setAdding(false)} onAdded={(a) => { if (!archived) setData((p) => [a, ...(p ?? [])]); toast('Added'); syncReminders(user).catch(() => {}); }} />
    </div>
  );
}

function EditSheet({ a, onClose, onSave, onDelete }: { a: Application; onClose: () => void; onSave: (b: Partial<Application>) => void; onDelete: () => void }) {
  const [status, setStatus] = useState(a.status);
  const [nextAction, setNextAction] = useState(a.nextAction ?? '');
  const [due, setDue] = useState(toDateInput(a.nextActionDue));
  const [deadline, setDeadline] = useState(toDateInput(a.deadline));
  const [notes, setNotes] = useState(a.notes ?? '');
  return (
    <Sheet open onClose={onClose} title={a.title}>
      {a.opportunityId && <Link to={`/opportunity/${a.opportunityId}`} className="small">View opportunity</Link>}
      {a.applicationUrl && <button className="link-btn row small" style={{ margin: '6px 0 12px' }} onClick={() => openExternal(a.applicationUrl!)}><IconExternal size={14} /> Open application site</button>}
      <Field label="Status" hint="“Applied” is only set by you — SarthiAI never assumes you submitted.">
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as ApplicationStatus)}>
          {APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </Field>
      <div className="grid-2">
        <Field label="Next action"><input className="input" value={nextAction} onChange={(e) => setNextAction(e.target.value)} maxLength={300} /></Field>
        <Field label="Due"><input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      </div>
      <Field label="Deadline"><input className="input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
      <Field label="Notes"><textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {a.statusHistory.length > 1 && (
        <details className="small" style={{ marginBottom: 12 }}>
          <summary className="faint">Status history</summary>
          <ul style={{ paddingLeft: 18 }}>{a.statusHistory.map((h, i) => <li key={i}>{STATUS_LABEL[h.status]} · {formatDate(h.at)}</li>)}</ul>
        </details>
      )}
      <button className="btn block" onClick={() => onSave({ status, nextAction: nextAction.trim() || null, nextActionDue: nextAction.trim() ? fromDateInput(due) : null, deadline: fromDateInput(deadline), notes })}>Save changes</button>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn ghost grow" onClick={() => onSave({ archived: !a.archived })}>{a.archived ? 'Unarchive' : 'Archive'}</button>
        <button className="btn danger grow" onClick={onDelete}>Delete</button>
      </div>
    </Sheet>
  );
}

function AddSheet({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (a: Application) => void }) {
  const [title, setTitle] = useState('');
  const [org, setOrg] = useState('');
  const [url, setUrl] = useState('');
  const [deadline, setDeadline] = useState('');
  const [status, setStatus] = useState<ApplicationStatus>('interested');
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setErr(null);
    try {
      const u = url.trim() && !/^https?:\/\//.test(url.trim()) ? `https://${url.trim()}` : url.trim();
      onAdded(await api.createApplication({ title: title.trim(), organization: org.trim() || undefined, applicationUrl: u || undefined, deadline: fromDateInput(deadline), status }));
      setTitle(''); setOrg(''); setUrl(''); setDeadline('');
      onClose();
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Track an outside application">
      <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Summer Analyst Internship" /></Field>
      <Field label="Organisation"><input className="input" value={org} onChange={(e) => setOrg(e.target.value)} /></Field>
      <Field label="Application link"><input className="input" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
      <div className="grid-2">
        <Field label="Deadline"><input className="input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
        <Field label="Status"><select className="input" value={status} onChange={(e) => setStatus(e.target.value as ApplicationStatus)}>{APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></Field>
      </div>
      {err && <div className="notice coral" style={{ marginBottom: 12 }}>{err}</div>}
      <button className="btn block" onClick={go} disabled={!title.trim()}>Add</button>
    </Sheet>
  );
}

/** Board columns. Dropping a card sets the column's status (Outcome asks which one). */
const COLUMNS: { key: string; title: string; statuses: ApplicationStatus[]; drop: ApplicationStatus }[] = [
  { key: 'interested', title: 'Interested', statuses: ['interested'], drop: 'interested' },
  { key: 'preparing', title: 'Preparing', statuses: ['preparing', 'ready_to_apply'], drop: 'preparing' },
  { key: 'applied', title: 'Applied', statuses: ['applied'], drop: 'applied' },
  { key: 'interview', title: 'Interview', statuses: ['assessment', 'interview'], drop: 'interview' },
  { key: 'outcome', title: 'Offer / Not selected', statuses: ['offer', 'rejected', 'withdrawn'], drop: 'offer' },
];

/**
 * Kanban view of the tracker. Drag a card to another column (mouse), or use its
 * "Move to" menu (keyboard, touch screens and screen readers).
 */
function Board({ items, onOpen, onMove, onSetStatus }: { items: Application[]; onOpen: (a: Application) => void; onMove: (a: Application, col: (typeof COLUMNS)[number]) => void; onSetStatus: (a: Application, s: ApplicationStatus) => void }) {
  const [over, setOver] = useState<string | null>(null);
  const byId = new Map(items.map((a) => [a.id, a]));
  const drop = (e: DragEvent, col: (typeof COLUMNS)[number]) => {
    e.preventDefault();
    setOver(null);
    const a = byId.get(e.dataTransfer.getData('text/plain'));
    if (a) onMove(a, col);
  };
  return (
    <div className="board" aria-label="Applications board">
      {COLUMNS.map((col) => {
        const cards = items.filter((a) => col.statuses.includes(a.status));
        return (
          <section key={col.key} className={`board-col ${over === col.key ? 'over' : ''}`} aria-label={`${col.title}, ${cards.length}`}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(col.key); }}
            onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
            onDrop={(e) => drop(e, col)} data-testid={`column-${col.key}`}>
            <h3 className="board-head">{col.title} <span className="faint">{cards.length}</span></h3>
            {cards.map((a) => (
              <article key={a.id} className="card board-card" draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', a.id); e.dataTransfer.effectAllowed = 'move'; }}>
                <button type="button" className="board-open" onClick={() => onOpen(a)}>
                  <strong className="small">{a.title}</strong>
                  {a.organization && <span className="faint">{a.organization}</span>}
                  {a.deadline && <span className="tag" style={{ marginTop: 6, alignSelf: 'flex-start' }}>{relativeDays(a.deadline)}</span>}
                </button>
                <select className="input board-move" aria-label={`Move “${a.title}” to`} value={a.status} onChange={(e) => onSetStatus(a, e.target.value as ApplicationStatus)}>
                  {APPLICATION_STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
                </select>
              </article>
            ))}
            {!cards.length && <p className="tiny faint" style={{ margin: '4px 2px' }}>Drop here</p>}
          </section>
        );
      })}
    </div>
  );
}
