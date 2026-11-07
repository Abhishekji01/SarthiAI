import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useUser } from '../lib/session';
import { formatDate, fromDateInput, TYPE_LABEL } from '../lib/format';
import { OPPORTUNITY_TYPES, type Announcement, type College, type Opportunity } from '../lib/types';
import { Empty, ErrorState, Field, Sheet, Skeleton, TopBar, useToast } from '../components/ui';
import { IconPlus } from '../components/icons';
import { usePageTitle } from '../lib/usePageTitle';

const TABS = ['Announcements', 'Listings', 'Metrics'] as const;
const CATEGORIES = ['general', 'placement', 'scholarship', 'internship', 'event', 'academic'];

export function Admin() {
  usePageTitle('Campus admin');
  const user = useUser();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Announcements');
  const colleges = useAsync(() => (user.role === 'student' ? Promise.resolve([] as College[]) : api.admin.colleges()), []);
  if (user.role === 'student') return <Navigate to="/" replace />;
  return (
    <div className="page wide">
      <TopBar title="Campus admin" kicker={user.role === 'platform_admin' ? 'Platform admin' : 'College admin'} back="/" />
      <div className="chips" style={{ marginBottom: 18 }}>{TABS.map((t) => <button key={t} className={`chip ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{t}</button>)}</div>
      {tab === 'Announcements' && <Announcements colleges={colleges.data ?? []} />}
      {tab === 'Listings' && <Listings colleges={colleges.data ?? []} platform={user.role === 'platform_admin'} />}
      {tab === 'Metrics' && <Metrics />}
    </div>
  );
}

function Announcements({ colleges }: { colleges: College[] }) {
  const toast = useToast();
  const { data, error, loading, reload, setData } = useAsync(() => api.admin.announcements(), []);
  const [open, setOpen] = useState(false);
  const setStatus = async (a: Announcement, status: 'published' | 'archived' | 'draft') => {
    try { const u = await api.admin.updateAnnouncement(a.id, { status }); setData((p) => (p ?? []).map((x) => (x.id === a.id ? u : x))); toast(status === 'published' ? 'Published to students' : 'Updated'); } catch (e) { toast((e as Error).message); }
  };
  return (
    <>
      <div className="section-head"><h2>Announcements</h2><button className="btn small" onClick={() => setOpen(true)}><IconPlus size={16} /> New</button></div>
      {loading && !data ? <Skeleton /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.length ? <Empty title="No announcements yet">Students of your college see published notices on their Home screen.</Empty> : (
        <div className="stack">
          {data.map((a) => (
            <article key={a.id} className="card">
              <div className="row"><p className="faint grow" style={{ margin: 0 }}>{a.category} · {a.collegeName}</p><span className={`tag ${a.status === 'published' ? 'jade' : a.status === 'draft' ? 'amber' : 'muted'}`}>{a.status}</span></div>
              <h3 style={{ marginTop: 6 }}>{a.title}</h3>
              <p className="small muted prewrap">{a.body}</p>
              <div className="row wrap">
                {a.status !== 'published' && <button className="btn small" onClick={() => setStatus(a, 'published')}>Publish</button>}
                {a.status === 'published' && <button className="btn small ghost" onClick={() => setStatus(a, 'archived')}>Archive</button>}
                {a.expiresAt && <span className="faint">Expires {formatDate(a.expiresAt)}</span>}
              </div>
            </article>
          ))}
        </div>
      )}
      <AnnouncementSheet open={open} onClose={() => setOpen(false)} colleges={colleges} onCreated={(a) => setData((p) => [a, ...(p ?? [])])} />
    </>
  );
}

function AnnouncementSheet({ open, onClose, colleges, onCreated }: { open: boolean; onClose: () => void; colleges: College[]; onCreated: (a: Announcement) => void }) {
  const [collegeId, setCollegeId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('general');
  const [sourceUrl, setSourceUrl] = useState('');
  const [expires, setExpires] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const go = async (status: 'draft' | 'published') => {
    setErr(null);
    try {
      onCreated(await api.admin.createAnnouncement({ collegeId: collegeId || colleges[0]?.id, title, body, category, sourceUrl: sourceUrl || undefined, status, expiresAt: fromDateInput(expires) }));
      setTitle(''); setBody(''); setSourceUrl('');
      onClose();
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="New announcement">
      {colleges.length > 1 && <Field label="College"><select className="input" value={collegeId} onChange={(e) => setCollegeId(e.target.value)}>{colleges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
      <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} /></Field>
      <Field label="Message"><textarea className="input" value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} /></Field>
      <div className="grid-2">
        <Field label="Category"><select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Expires (optional)"><input className="input" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></Field>
      </div>
      <Field label="Source link (optional)"><input className="input" inputMode="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://" /></Field>
      {err && <div className="notice coral" style={{ marginBottom: 12 }}>{err}</div>}
      <div className="row"><button className="btn ghost" onClick={() => go('draft')} disabled={!title || !body}>Save draft</button><button className="btn grow" onClick={() => go('published')} disabled={!title || !body}>Publish</button></div>
    </Sheet>
  );
}

function Listings({ colleges, platform }: { colleges: College[]; platform: boolean }) {
  const toast = useToast();
  const { data, error, loading, reload, setData } = useAsync(() => api.admin.opportunities(), []);
  const [open, setOpen] = useState(false);
  const [verifying, setVerifying] = useState<Opportunity | null>(null);
  const replace = (o: Opportunity) => setData((p) => (p ?? []).map((x) => (x.id === o.id ? o : x)));
  return (
    <>
      <div className="section-head"><h2>Listings</h2><button className="btn small" onClick={() => setOpen(true)}><IconPlus size={16} /> New</button></div>
      <p className="faint">New listings start as “pending”. Verify only after checking the official source — editing facts later resets verification.</p>
      {loading && !data ? <Skeleton /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.length ? <Empty title="No listings yet" /> : (
        <div className="stack">
          {data.map((o) => (
            <article key={o.id} className="card">
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div className="grow"><p className="faint" style={{ marginBottom: 2 }}>{TYPE_LABEL[o.opportunityType]} · {o.organization}</p><h3>{o.title}</h3></div>
                <span className={`tag ${o.status === 'published' ? 'jade' : 'amber'}`}>{o.status}</span>
              </div>
              <div className="opp-meta">
                <span className={`tag ${o.verificationStatus === 'verified' ? 'jade' : 'amber'}`}>{o.verificationStatus}</span>
                {o.deadline && <span className="tag">Deadline {formatDate(o.deadline)}</span>}
                {!o.collegeId && <span className="tag accent">Public</span>}
              </div>
              <div className="row wrap" style={{ marginTop: 10 }}>
                {o.verificationStatus !== 'verified' && <button className="btn small" onClick={() => setVerifying(o)}>Verify</button>}
                <button className="btn small ghost" onClick={async () => { try { replace(await api.admin.updateOpportunity(o.id, { status: o.status === 'published' ? 'draft' : 'published' })); } catch (e) { toast((e as Error).message); } }}>
                  {o.status === 'published' ? 'Unpublish' : 'Publish'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <ListingSheet open={open} onClose={() => setOpen(false)} colleges={colleges} platform={platform} onCreated={(o) => setData((p) => [o, ...(p ?? [])])} />
      {verifying && <VerifySheet o={verifying} onClose={() => setVerifying(null)} onVerified={(o) => { replace(o); toast('Verified'); }} />}
    </>
  );
}

function VerifySheet({ o, onClose, onVerified }: { o: Opportunity; onClose: () => void; onVerified: (o: Opportunity) => void }) {
  const [checked, setChecked] = useState(false);
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <Sheet open onClose={onClose} title="Verify listing">
      <p className="small">Open <a href={o.sourceUrl} target="_blank" rel="noreferrer">{o.sourceUrl}</a> and confirm the title, dates, amounts and eligibility match what SarthiAI shows.</p>
      <Field label="Notes (optional)"><textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 70 }} /></Field>
      <label className="check"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /> I checked these facts against the official source</label>
      {err && <div className="notice coral" style={{ margin: '12px 0' }}>{err}</div>}
      <button className="btn block" style={{ marginTop: 12 }} disabled={!checked} onClick={async () => { try { onVerified(await api.admin.verify(o.id, notes || undefined)); onClose(); } catch (e) { setErr((e as Error).message); } }}>Mark verified</button>
    </Sheet>
  );
}

function ListingSheet({ open, onClose, colleges, platform, onCreated }: { open: boolean; onClose: () => void; colleges: College[]; platform: boolean; onCreated: (o: Opportunity) => void }) {
  const [f, setF] = useState({ title: '', organization: '', opportunityType: 'internship', sourceUrl: '', applicationUrl: '', deadline: '', officialDescription: '', collegeId: '', years: '', degrees: '', skills: '', status: 'draft' });
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
  const go = async () => {
    setErr(null);
    try {
      onCreated(await api.admin.createOpportunity({
        title: f.title, organization: f.organization, opportunityType: f.opportunityType, sourceUrl: f.sourceUrl, applicationUrl: f.applicationUrl || undefined,
        deadline: fromDateInput(f.deadline), declaredStatus: f.deadline ? 'open' : 'unknown', officialDescription: f.officialDescription || undefined,
        collegeId: f.collegeId || (platform ? null : colleges[0]?.id ?? null), eligibleYears: list(f.years).map(Number).filter((n) => n >= 1 && n <= 6),
        eligibleDegrees: list(f.degrees), requiredSkills: list(f.skills), status: f.status,
      }));
      onClose();
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="New listing">
      <Field label="Title"><input className="input" value={f.title} onChange={(e) => set({ title: e.target.value })} /></Field>
      <div className="grid-2">
        <Field label="Organisation"><input className="input" value={f.organization} onChange={(e) => set({ organization: e.target.value })} /></Field>
        <Field label="Type"><select className="input" value={f.opportunityType} onChange={(e) => set({ opportunityType: e.target.value })}>{OPPORTUNITY_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></Field>
      </div>
      <Field label="Official source URL"><input className="input" inputMode="url" value={f.sourceUrl} onChange={(e) => set({ sourceUrl: e.target.value })} placeholder="https://" /></Field>
      <Field label="Application URL (optional)"><input className="input" inputMode="url" value={f.applicationUrl} onChange={(e) => set({ applicationUrl: e.target.value })} /></Field>
      <div className="grid-2">
        <Field label="Deadline"><input className="input" type="date" value={f.deadline} onChange={(e) => set({ deadline: e.target.value })} /></Field>
        <Field label="Audience"><select className="input" value={f.collegeId} onChange={(e) => set({ collegeId: e.target.value })}>
          {platform && <option value="">Public (all students)</option>}
          {colleges.map((c) => <option key={c.id} value={c.id}>{c.name} only</option>)}
        </select></Field>
      </div>
      <div className="grid-2">
        <Field label="Eligible years (e.g. 2, 3)"><input className="input" value={f.years} onChange={(e) => set({ years: e.target.value })} /></Field>
        <Field label="Eligible degrees (comma separated)"><input className="input" value={f.degrees} onChange={(e) => set({ degrees: e.target.value })} placeholder="B.Tech, BCA" /></Field>
      </div>
      <Field label="Required skills (comma separated)"><input className="input" value={f.skills} onChange={(e) => set({ skills: e.target.value })} /></Field>
      <Field label="Official description"><textarea className="input" value={f.officialDescription} onChange={(e) => set({ officialDescription: e.target.value })} /></Field>
      <label className="check"><input type="checkbox" checked={f.status === 'published'} onChange={(e) => set({ status: e.target.checked ? 'published' : 'draft' })} /> Publish now (shows as “not yet verified” until you verify)</label>
      {err && <div className="notice coral" style={{ margin: '12px 0' }}>{err}</div>}
      <button className="btn block" style={{ marginTop: 12 }} onClick={go} disabled={!f.title || !f.organization || !f.sourceUrl}>Create listing</button>
    </Sheet>
  );
}

function Metrics() {
  const { data, error, loading, reload } = useAsync(() => api.admin.metrics(), []);
  if (loading && !data) return <Skeleton />;
  if (error || !data) return <ErrorState error={error ?? new Error('No data')} onRetry={reload} />;
  const n = (c: { count: number | null; suppressed: boolean }) => (c.suppressed ? '<3' : c.count ?? 0);
  return (
    <>
      <div className="grid-2">
        <div className="card"><p className="faint">Students on SarthiAI</p><div className="score" style={{ fontSize: 34 }}>{n(data.studentsOnSarthi)}</div></div>
        <div className="card"><p className="faint">Announcements</p><p className="small">{Object.entries(data.announcements).map(([k, v]) => `${v} ${k}`).join(' · ')}</p></div>
      </div>
      <section className="section">
        <h2>Listing engagement</h2>
        <div className="scroll-x card" style={{ padding: 0 }}>
          <table className="table">
            <thead><tr><th>Listing</th><th>Status</th><th>Saves</th><th>Tracked</th></tr></thead>
            <tbody>{data.listings.map((l) => <tr key={l.opportunityId}><td>{l.title}</td><td>{l.status} · {l.verificationStatus}</td><td>{n(l.saves)}</td><td>{n(l.tracked)}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="tiny faint" style={{ marginTop: 8 }}>{data.note}</p>
      </section>
    </>
  );
}
