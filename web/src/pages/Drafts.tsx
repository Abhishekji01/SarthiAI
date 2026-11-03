import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { shareText } from '../lib/platform';
import { formatDate, titleCase } from '../lib/format';
import type { DraftKind } from '../lib/types';
import { Empty, ErrorState, Field, Sheet, Skeleton, TopBar, useToast } from '../components/ui';
import { IconDoc, IconPlus, IconShare, IconSpark, IconTrash } from '../components/icons';

export function Drafts() {
  const navigate = useNavigate();
  const { data, error, loading, reload } = useAsync(() => api.drafts(), []);
  const [newOpen, setNewOpen] = useState(false);
  return (
    <div className="page">
      <TopBar title="Drafts" back="/" actions={<button className="icon-btn" aria-label="New draft" onClick={() => setNewOpen(true)}><IconPlus /></button>} />
      {loading && !data ? <Skeleton count={3} height={72} /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.length ? (
        <Empty icon={<IconDoc size={40} />} title="No drafts yet">Generate an email or cover letter from any opportunity, or create a resume here with +.</Empty>
      ) : (
        <div className="stack">
          {data.map((d) => (
            <Link key={d.id} to={`/drafts/${d.id}`} className="card" style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
              <div className="row">
                <div className="grow"><p className="kicker" style={{ marginBottom: 2 }}>{titleCase(d.kind)}{d.generatedBy === 'ai' ? ' · AI draft' : ''}</p><h3>{d.title ?? d.subject ?? 'Untitled draft'}</h3></div>
                <span className={`tag ${d.reviewedAt ? 'jade' : 'amber'}`}>{d.reviewedAt ? 'Reviewed' : 'Needs review'}</span>
              </div>
              <p className="faint" style={{ margin: '6px 0 0' }}>Updated {formatDate(d.updatedAt)}</p>
            </Link>
          ))}
        </div>
      )}
      <NewDraftSheet open={newOpen} onClose={() => setNewOpen(false)} onCreated={(id) => navigate(`/drafts/${id}`)} />
    </div>
  );
}

function NewDraftSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [kind, setKind] = useState<'resume' | 'resume_summary' | 'blank'>('resume');
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      const d = kind === 'blank'
        ? await api.createDraft({ kind: 'email' as DraftKind, title: 'New draft', body: 'Write here…' })
        : await api.generateResume({ kind, extraContext: extra || undefined });
      onCreated(d.id);
    } catch (e) {
      setErr(e instanceof ApiError && e.isAIUnavailable ? `${e.message} Choose “Blank” to write one yourself.` : (e as Error).message);
    } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="New draft">
      <div className="chips" style={{ marginBottom: 14 }}>
        <button className={`chip ${kind === 'resume' ? 'on' : ''}`} onClick={() => setKind('resume')}>Resume (AI)</button>
        <button className={`chip ${kind === 'resume_summary' ? 'on' : ''}`} onClick={() => setKind('resume_summary')}>Resume summary (AI)</button>
        <button className={`chip ${kind === 'blank' ? 'on' : ''}`} onClick={() => setKind('blank')}>Blank</button>
      </div>
      {kind !== 'blank' && <Field label="Anything to emphasise? (optional)"><textarea className="input" value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={600} style={{ minHeight: 80 }} /></Field>}
      <p className="tiny faint">AI drafts use only facts from your profile; gaps are marked [ADD: …].</p>
      {err && <div className="notice amber" style={{ marginBottom: 12 }}>{err}</div>}
      <button className="btn block" onClick={go} disabled={busy}>{kind !== 'blank' && <IconSpark size={16} />} {busy ? 'Working…' : 'Create'}</button>
    </Sheet>
  );
}

export function DraftEditor() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: d, error, loading, reload, setData } = useAsync(() => api.draft(id), [id]);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (d) { setTitle(d.title ?? ''); setSubject(d.subject ?? ''); setBody(d.body); } }, [d?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !d) return <div className="page"><TopBar title="Draft" back="/drafts" /><Skeleton count={2} height={160} /></div>;
  if (error || !d) return <div className="page"><TopBar title="Draft" back="/drafts" /><ErrorState error={error ?? new Error('Not found')} onRetry={reload} /></div>;

  const dirty = title !== (d.title ?? '') || subject !== (d.subject ?? '') || body !== d.body;
  const placeholders = [...body.matchAll(/\[ADD:\s*([^\]]+)\]/g)].map((m) => m[1]);
  const save = async (markReviewed = false) => {
    setSaving(true);
    try { setData(await api.updateDraft(d.id, { title, subject, body, ...(markReviewed ? { markReviewed: true } : {}) })); toast(markReviewed ? 'Marked as reviewed' : 'Saved'); } catch (e) { toast((e as Error).message); } finally { setSaving(false); }
  };
  const fullText = `${subject ? `Subject: ${subject}\n\n` : ''}${body}`;
  const exportPdf = () => {
    const w = window.open('', '_blank');
    if (!w) return toast('Allow pop-ups to export');
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
    w.document.write(`<!doctype html><title>${esc(title || 'Draft')}</title><style>body{font:12pt/1.55 Georgia,serif;max-width:680px;margin:40px auto;padding:0 24px;white-space:pre-wrap;color:#111}</style>${subject ? `<p><strong>${esc(subject)}</strong></p>` : ''}${esc(body)}`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div className="page">
      <TopBar title={titleCase(d.kind)} back="/drafts" kicker={d.generatedBy === 'ai' ? 'AI draft · review before using' : 'Your draft'} actions={
        <button className="icon-btn" aria-label="Share" onClick={async () => { const r = await shareText(title || 'Draft', fullText); if (r === 'copied') toast('Copied to clipboard'); }}><IconShare size={18} /></button>
      } />
      {!d.reviewedAt && <div className="notice amber" style={{ marginBottom: 12 }}>Read it through and fix anything inaccurate, then mark it reviewed. Nothing is ever sent for you.</div>}
      {placeholders.length > 0 && <div className="notice accent" style={{ marginBottom: 12 }}>Fill in {placeholders.length} placeholder{placeholders.length === 1 ? '' : 's'}: {placeholders.join(', ')}</div>}
      {d.missingInformation.filter((m) => !placeholders.includes(m)).length > 0 && (
        <div className="notice" style={{ marginBottom: 12 }}>Check: {d.missingInformation.filter((m) => !placeholders.includes(m)).join(' · ')}</div>
      )}
      {d.opportunityId && <p className="small"><Link to={`/opportunity/${d.opportunityId}`}>View the opportunity</Link></p>}
      <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      {(d.kind === 'email' || subject) && <Field label="Subject"><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>}
      <Field label="Body"><textarea className="input" value={body} onChange={(e) => setBody(e.target.value)} style={{ minHeight: 360, fontFamily: d.kind === 'resume' ? 'ui-monospace, monospace' : undefined, fontSize: 15 }} /></Field>
      <div className="bottom-bar" style={{ flexWrap: 'wrap' }}>
        <button className="btn grow" onClick={() => save(!d.reviewedAt)} disabled={saving || (!dirty && Boolean(d.reviewedAt))}>{saving ? 'Saving…' : d.reviewedAt ? 'Save' : 'Save & mark reviewed'}</button>
        <button className="btn ghost" onClick={exportPdf}>PDF</button>
        <button className="icon-btn" style={{ width: 44, height: 44 }} aria-label="Delete draft" onClick={async () => { if (confirm('Delete this draft?')) { await api.deleteDraft(d.id); navigate('/drafts', { replace: true }); } }}><IconTrash size={18} /></button>
      </div>
    </div>
  );
}
