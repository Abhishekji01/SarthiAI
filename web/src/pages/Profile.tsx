import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, serverOverrideAllowed } from '../lib/api';
import { ServerSettings } from '../components/ServerSettings';
import { useSession, useUser } from '../lib/session';
import { isNative, platform, reminderPermission, requestReminderPermission, type ReminderPermission } from '../lib/platform';
import { syncReminders } from '../lib/reminders';
import { CollegePicker, draftFrom, EducationFields, InterestFields, PreferenceFields, ProjectFields, toPatch, type Draft } from '../components/ProfileForm';
import { Field, Sheet, TopBar, useToast } from '../components/ui';
import { IconBell, IconBookmark, IconDoc, IconMegaphone, IconSettings, IconShield, IconUser } from '../components/icons';

export function ProfilePage() {
  const user = useUser();
  const { signOut, setUser } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const p = user.profile;
  const [perm, setPerm] = useState<ReminderPermission>('prompt');
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  useEffect(() => { reminderPermission().then(setPerm); }, []);

  const completeness = [p.degree, p.branch, p.currentYear, p.skills?.length, p.interests?.length, p.careerGoal, p.collegeId].filter(Boolean).length;
  const isAdmin = user.role !== 'student';

  const setPrefs = async (prefs: Partial<typeof user.notificationPrefs>) => {
    try {
      const u = await api.updateProfile({ notificationPrefs: prefs });
      setUser(u);
      syncReminders(u).catch(() => {});
    } catch (e) { toast((e as Error).message); }
  };

  return (
    <div className="page">
      <TopBar title="Profile" back="/" />
      <section className="card row" style={{ alignItems: 'flex-start' }}>
        <span className="opp-mark" style={{ width: 54, height: 54, fontSize: 24 }}>{user.name.charAt(0).toUpperCase()}</span>
        <div className="grow">
          <h2 style={{ margin: 0 }}>{user.name}</h2>
          <p className="faint" style={{ margin: 0 }}>{user.email}</p>
          <p className="small muted" style={{ margin: '6px 0 0' }}>{[p.degree, p.branch, p.currentYear && `Year ${p.currentYear}`, p.collegeName].filter(Boolean).join(' · ') || 'Profile incomplete'}</p>
        </div>
      </section>
      {completeness < 7 && (
        <div className="notice accent" style={{ marginTop: 12 }}>
          <span className="grow">Profile {Math.round((completeness / 7) * 100)}% complete — more detail means more accurate eligibility checks and matches.</span>
        </div>
      )}
      <Link to="/profile/edit" className="btn block" style={{ marginTop: 12 }}><IconUser size={18} /> Edit profile</Link>

      {(p.skills?.length ?? 0) > 0 && (
        <section className="section">
          <p className="faint">Skills</p>
          <div className="chips">{p.skills!.map((s) => <span key={s} className="tag accent">{s}</span>)}</div>
          {(p.interests?.length ?? 0) > 0 && <><p className="faint" style={{ marginTop: 14 }}>Interests</p><div className="chips">{p.interests!.map((s) => <span key={s} className="tag">{s}</span>)}</div></>}
        </section>
      )}

      <section className="section">
        <ul className="list card" style={{ padding: '2px 16px' }}>
          <li><Link to="/saved" className="row" style={{ padding: '14px 0', color: 'inherit' }}><IconBookmark size={20} /> <span className="grow">Saved opportunities</span> ›</Link></li>
          <li><Link to="/drafts" className="row" style={{ padding: '14px 0', color: 'inherit' }}><IconDoc size={20} /> <span className="grow">Drafts</span> ›</Link></li>
          {isAdmin && <li><Link to="/admin" className="row" style={{ padding: '14px 0', color: 'inherit' }}><IconMegaphone size={20} /> <span className="grow">Campus admin</span> ›</Link></li>}
          <li><button className="row" style={{ padding: '14px 0', width: '100%', background: 'none', border: 0, cursor: 'pointer' }} onClick={() => setPrivacyOpen(true)}><IconShield size={20} /> <span className="grow" style={{ textAlign: 'left' }}>Privacy & data</span> ›</button></li>
          {serverOverrideAllowed && <li><button className="row" style={{ padding: '14px 0', width: '100%', background: 'none', border: 0, cursor: 'pointer' }} onClick={() => setDevOpen(true)}><IconSettings size={20} /> <span className="grow" style={{ textAlign: 'left' }}>Developer · server</span> ›</button></li>}
        </ul>
      </section>

      <section className="section">
        <h2>Reminders</h2>
        <div className="card">
          <label className="check"><input type="checkbox" checked={user.notificationPrefs.deadlineReminders} onChange={(e) => setPrefs({ deadlineReminders: e.target.checked })} /> Deadline & next-action reminders</label>
          <Field label="Remind me before a deadline">
            <select className="input" value={user.notificationPrefs.reminderDaysBefore} onChange={(e) => setPrefs({ reminderDaysBefore: Number(e.target.value) })} disabled={!user.notificationPrefs.deadlineReminders}>
              {[0, 1, 2, 3, 5, 7, 14].map((d) => <option key={d} value={d}>{d === 0 ? 'On the day' : `${d} day${d === 1 ? '' : 's'} before`}</option>)}
            </select>
          </Field>
          <label className="check"><input type="checkbox" checked={user.notificationPrefs.campusAnnouncements} onChange={(e) => setPrefs({ campusAnnouncements: e.target.checked })} /> Show campus announcements</label>
          {perm !== 'granted' && perm !== 'unsupported' && (
            <div className="notice amber" style={{ marginTop: 10 }}>
              <IconBell size={18} />
              <span className="grow">{perm === 'denied' ? `Notifications are blocked. Enable them in ${isNative ? 'Android Settings ▸ Apps ▸ SarthiAI' : 'your browser settings'}.` : 'Allow notifications to get reminders.'}</span>
              {perm === 'prompt' && <button className="btn small" onClick={async () => { const r = await requestReminderPermission(); setPerm(r); if (r === 'granted') syncReminders(user); }}>Allow</button>}
            </div>
          )}
          {!isNative && <p className="tiny faint" style={{ marginTop: 8 }}>In a browser, reminders show while SarthiAI is open. Install the Android app for reminders when it’s closed.</p>}
        </div>
      </section>

      <section className="section">
        <button className="btn block ghost" onClick={async () => { await signOut(); navigate('/welcome'); }}>Sign out</button>
        <button className="btn block danger" style={{ marginTop: 10 }} onClick={() => setDeleteOpen(true)}>Delete account</button>
        <p className="tiny faint" style={{ textAlign: 'center', marginTop: 16 }}>SarthiAI · {platform === 'android' ? 'Android app' : 'Web app'}</p>
      </section>

      <Sheet open={privacyOpen} onClose={() => setPrivacyOpen(false)} title="Privacy & data">
        <ul className="small muted" style={{ paddingLeft: 18 }}>
          <li>Your profile, saved items, tracker, roadmap and drafts are visible only to you.</li>
          <li>Income and home state are optional, used only for eligibility checks, never sent to the AI and never shown to your college.</li>
          <li>Sarthi (AI) sees your first name, education, skills, interests, goals and projects only when you use an AI feature.</li>
          <li>College admins see only aggregate counts (hidden below 3), never individual students.</li>
          <li>Opening an official link never changes your application status.</li>
          <li>Deleting your account permanently removes your profile, saved items, applications, roadmap and drafts.</li>
        </ul>
      </Sheet>
      {serverOverrideAllowed && <DevSheet open={devOpen} onClose={() => setDevOpen(false)} />}
      <DeleteSheet open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </div>
  );
}

function DevSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Developer · server">
      <ServerSettings onSaved={onClose} />
    </Sheet>
  );
}

function DeleteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { signOut } = useSession();
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title="Delete account">
      <p className="small">This permanently deletes your profile, saved items, applications, roadmap and drafts. It cannot be undone.</p>
      <Field label="Confirm with your password"><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      {err && <div className="notice coral" style={{ marginBottom: 12 }}>{err}</div>}
      <button className="btn block danger" disabled={!password || busy} onClick={async () => {
        setBusy(true); setErr(null);
        try { await api.deleteAccount(password); await signOut(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
      }}>{busy ? 'Deleting…' : 'Delete everything'}</button>
    </Sheet>
  );
}

const SECTIONS = ['Basics', 'Education', 'Skills & goals', 'Preferences', 'Projects & links'] as const;

export function EditProfile() {
  const user = useUser();
  const { setUser } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(user));
  const [section, setSection] = useState<(typeof SECTIONS)[number]>('Basics');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const save = async () => {
    setBusy(true); setErr(null);
    try { setUser(await api.updateProfile(toPatch(draft, user, true))); toast('Profile saved'); navigate('/profile'); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="page">
      <TopBar title="Edit profile" back="/profile" />
      <div className="chips scroll" style={{ marginBottom: 18 }}>
        {SECTIONS.map((s) => <button key={s} className={`chip ${section === s ? 'on' : ''}`} onClick={() => setSection(s)}>{s}</button>)}
      </div>
      {section === 'Basics' && (<><Field label="Full name"><input className="input" value={draft.name} onChange={(e) => set({ name: e.target.value })} /></Field><CollegePicker draft={draft} set={set} /></>)}
      {section === 'Education' && <EducationFields draft={draft} set={set} />}
      {section === 'Skills & goals' && <InterestFields draft={draft} set={set} />}
      {section === 'Preferences' && <PreferenceFields draft={draft} set={set} />}
      {section === 'Projects & links' && <ProjectFields draft={draft} set={set} />}
      {err && <div className="notice coral" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      <div className="bottom-bar"><button className="btn grow" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button></div>
    </div>
  );
}
