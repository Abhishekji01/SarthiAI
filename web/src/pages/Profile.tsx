import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, serverOverrideAllowed } from '../lib/api';
import { FIELD_STEP, fieldErrorsFromServer, firstErrorField, focusField, validateAll, type FieldErrors } from '../lib/profileValidation';
import { ServerSettings } from '../components/ServerSettings';
import { Avatar } from '../components/Avatar';
import { useSession, useUser } from '../lib/session';
import { isNative, platform, reminderPermission, requestReminderPermission, type ReminderPermission } from '../lib/platform';
import { syncReminders } from '../lib/reminders';
import { CollegePicker, draftFrom, EducationFields, InterestFields, PreferenceFields, ProjectFields, toPatch, type Draft } from '../components/ProfileForm';
import { Field, Sheet, TopBar, useToast } from '../components/ui';
import { IconBell, IconBookmark, IconDoc, IconMegaphone, IconSearch, IconSettings, IconShield, IconUser } from '../components/icons';
import { usePageTitle } from '../lib/usePageTitle';

export function ProfilePage() {
  usePageTitle('Profile');
  const user = useUser();
  const { signOut, signOutEverywhere, setUser } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const p = user.profile;
  const [perm, setPerm] = useState<ReminderPermission>('prompt');
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  useEffect(() => { reminderPermission().then(setPerm); }, []);
  const [emailDelivery, setEmailDelivery] = useState<boolean | null>(null);
  useEffect(() => { api.authConfig().then((c) => setEmailDelivery(c.emailDelivery)).catch(() => {}); }, []);

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
        <Avatar name={user.name} size={54} />
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
          <li><Link to="/searches" className="row" style={{ padding: '14px 0', color: 'inherit' }}><IconSearch size={20} /> <span className="grow">Saved searches</span> ›</Link></li>
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
          {!isNative && <p className="tiny faint" style={{ marginTop: 8 }}>In a browser, notifications show while SarthiAI is open. For reminders when it’s closed, use email below, add deadlines to your calendar from each listing, or install the Android app.</p>}
          <hr style={{ border: 0, borderTop: '1px solid var(--rule)', margin: '12px 0' }} />
          <p className="faint" style={{ margin: '0 0 4px' }}>Email</p>
          <label className="check"><input type="checkbox" checked={user.notificationPrefs.emailDeadlines !== false} onChange={(e) => setPrefs({ emailDeadlines: e.target.checked })} disabled={!user.notificationPrefs.deadlineReminders} /> Deadline emails for saved and tracked listings</label>
          <label className="check"><input type="checkbox" checked={user.notificationPrefs.emailDigest !== false} onChange={(e) => setPrefs({ emailDigest: e.target.checked })} /> Weekly summary (Mondays): upcoming dates and new matches</label>
          <p className="tiny faint" style={{ marginTop: 4 }}>
            {user.emailVerified === false ? `Emails start once you confirm ${user.email} (see the banner at the top).` : `Sent to ${user.email}. Every email has a one-click unsubscribe link.`}
            {emailDelivery === false && ' Email delivery isn’t set up on this server yet.'}
          </p>
        </div>
      </section>

      <section className="section">
        <button className="btn block ghost" onClick={async () => { await signOut(); navigate('/welcome'); }}>Sign out</button>
        <button className="btn block ghost" style={{ marginTop: 10 }} onClick={async () => { try { await signOutEverywhere(); navigate('/welcome'); } catch (e) { toast((e as Error).message); } }}>Sign out of all devices</button>
        <button className="btn block danger" style={{ marginTop: 10 }} onClick={() => setDeleteOpen(true)}>Delete account</button>
        <p className="tiny faint" style={{ textAlign: 'center', marginTop: 16 }}>SarthiAI · {platform === 'android' ? 'Android app' : 'Web app'}</p>
      </section>

      <Sheet open={privacyOpen} onClose={() => setPrivacyOpen(false)} title="Privacy & data">
        <ul className="small muted" style={{ paddingLeft: 18 }}>
          <li>Your profile, saved items, tracker, roadmap and drafts are visible only to you.</li>
          <li>Private details — income, home state, gender, category, disability, minority status, parent or guardian’s service and first-generation status — are optional and used only for scholarship eligibility checks. They are never sent to the AI (Sarthi sees only that a criterion was “checked privately”) and never shown to your college.</li>
          <li>Sarthi (AI) sees your first name, education, skills, interests, goals and projects only when you use an AI feature.</li>
          <li>College admins see only aggregate counts (hidden below 3), never individual students.</li>
          <li>Opening an official link never changes your application status.</li>
          <li>Your Yes/No answers in “What am I missing?” are saved per listing so checks and rankings remember them. You can clear them below or on each listing.</li>
          <li>Deleting your account permanently removes your profile, saved items, applications, roadmap, drafts and saved answers.</li>
        </ul>
        <button type="button" className="btn block ghost" onClick={async () => { try { const r = await api.clearAnswers(); toast(r.cleared ? `Cleared ${r.cleared} saved answer${r.cleared === 1 ? '' : 's'}` : 'No saved answers'); } catch (e) { toast((e as Error).message); } }}>Clear all saved eligibility answers</button>
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
  usePageTitle('Edit profile');
  const user = useUser();
  const { setUser } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(user));
  const [section, setSection] = useState<(typeof SECTIONS)[number]>('Basics');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = (p: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...p }));
    setErrors((e) => { const next = { ...e }; for (const k of Object.keys(p)) delete next[k as keyof FieldErrors]; return next; });
  };
  const showErrors = (e: FieldErrors) => {
    setErrors(e);
    const first = firstErrorField(e);
    if (first) { setSection(SECTIONS[FIELD_STEP[first]]); focusField(first); }
  };
  const save = async () => {
    const e = validateAll(draft, { requireCore: true });
    if (Object.keys(e).length) return showErrors(e);
    setBusy(true); setErr(null);
    try { setUser(await api.updateProfile(toPatch(draft, user, true))); toast('Profile saved'); navigate('/profile'); } catch (e) {
      const fieldErrors = e instanceof ApiError ? fieldErrorsFromServer(e.details) : {};
      if (Object.keys(fieldErrors).length) showErrors(fieldErrors); else setErr((e as Error).message);
    } finally { setBusy(false); }
  };
  return (
    <div className="page with-footer">
      <TopBar title="Edit profile" back="/profile" />
      <div className="chips scroll" style={{ marginBottom: 18 }}>
        {SECTIONS.map((s) => <button key={s} className={`chip ${section === s ? 'on' : ''}`} onClick={() => setSection(s)} aria-pressed={section === s}>{s}</button>)}
      </div>
      {section === 'Basics' && (<><Field label="Full name"><input className="input" value={draft.name} onChange={(e) => set({ name: e.target.value })} maxLength={100} /></Field><CollegePicker draft={draft} set={set} errors={errors} /></>)}
      {section === 'Education' && <EducationFields draft={draft} set={set} errors={errors} />}
      {section === 'Skills & goals' && <InterestFields draft={draft} set={set} errors={errors} />}
      {section === 'Preferences' && <PreferenceFields draft={draft} set={set} errors={errors} />}
      {section === 'Projects & links' && <ProjectFields draft={draft} set={set} />}
      <div className="bottom-bar">
        {err && <div className="notice coral bottom-bar-error" role="alert">{err}</div>}
        <button className="btn grow" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
      </div>
    </div>
  );
}
