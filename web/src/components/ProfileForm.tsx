import { useEffect, useRef, useState } from 'react';
import { api, type ProfilePatch } from '../lib/api';
import type { College, Experience, Profile, Project, ResumeSuggestions, User } from '../lib/types';
import { Field, Sheet, TokenEditor } from './ui';
import { fieldId, type FieldErrors } from '../lib/profileValidation';
import { incomeDigits } from '../../../shared/profileRules.js';
import { OTHER_STATE, STATES, UNION_TERRITORIES } from '../../../shared/states.js';
import { GENDERS, PARENT_SERVICES, SOCIAL_CATEGORIES } from '../../../shared/privateFields.js';
import { IconPlus, IconTrash } from './icons';

export const DEGREES = ['B.Tech', 'B.E.', 'BCA', 'B.Sc', 'BS', 'B.Com', 'BA', 'BBA', 'B.Arch', 'B.Pharm', 'MBBS', 'B.Des', 'LLB', 'M.Tech', 'M.E.', 'MCA', 'M.Sc', 'MBA', 'MA', 'Diploma', 'Integrated', 'PhD', 'Other'];
export const BRANCHES = ['Computer Science and Engineering', 'Information Technology', 'AI & Machine Learning', 'Data Science', 'Cybersecurity', 'Electronics and Communication', 'Electrical Engineering', 'Mechanical Engineering', 'Civil Engineering', 'Chemical Engineering', 'Biotechnology'];
export const SKILLS = ['Python', 'Java', 'C++', 'JavaScript', 'React', 'Node.js', 'SQL', 'Git', 'Linux', 'Networking', 'Machine Learning', 'Data Analysis', 'Web Security', 'Android', 'Figma', 'Communication'];
export const INTERESTS = ['Scholarships', 'Internships', 'Research', 'AI/ML', 'Cybersecurity', 'Web Development', 'Open Source', 'Hackathons', 'Data Science', 'Government programmes', 'Startups', 'Space science'];
export const LOCATIONS = ['Delhi NCR', 'Bengaluru', 'Mumbai', 'Hyderabad', 'Pune', 'Chennai', 'Kolkata'];

/** Editable copy of the profile. Converted to an API patch with toPatch(). */
export interface Draft {
  name: string;
  college: { id: string; name: string } | null;
  customCollege: string;
  degree: string; branch: string; currentYear: string; graduationYear: string; cgpa: string;
  skills: string[]; interests: string[]; careerGoal: string; headline: string;
  workModes: ('remote' | 'hybrid' | 'onsite')[]; locations: string[];
  homeState: string; income: string;
  /** Private scholarship details: '' = prefer not to say. Yes/no fields use 'yes' | 'no' | ''. */
  gender: string; socialCategory: string; disability: string; minority: string; parentService: string; firstGeneration: string;
  projects: Project[]; experience: Experience[]; achievements: string[];
  github: string; linkedin: string; portfolio: string;
}

export function draftFrom(user: User): Draft {
  const p: Profile = user.profile ?? ({} as Profile);
  return {
    name: user.name,
    college: p.collegeId ? { id: p.collegeId, name: p.collegeName ?? 'Your college' } : null,
    customCollege: '',
    degree: p.degree ?? '', branch: p.branch ?? '',
    currentYear: p.currentYear ? String(p.currentYear) : '', graduationYear: p.graduationYear ? String(p.graduationYear) : '',
    cgpa: p.cgpa != null ? String(p.cgpa) : '',
    skills: p.skills ?? [], interests: p.interests ?? [], careerGoal: p.careerGoal ?? '', headline: p.headline ?? '',
    workModes: p.workModes ?? [], locations: p.preferredLocations ?? [],
    homeState: p.homeState ?? '', income: p.annualFamilyIncomeINR != null ? String(p.annualFamilyIncomeINR) : '',
    gender: p.gender ?? '', socialCategory: p.socialCategory ?? '', parentService: p.parentService ?? '',
    disability: yesNo(p.disability), minority: yesNo(p.minority), firstGeneration: yesNo(p.firstGeneration),
    projects: (p.projects ?? []).map((x) => ({ title: x.title, description: x.description ?? '', skills: x.skills ?? [], url: x.url ?? '' })),
    experience: (p.experience ?? []).map((x) => ({ role: x.role, organization: x.organization, description: x.description ?? '', startDate: x.startDate ?? null, endDate: x.endDate ?? null })),
    achievements: p.achievements ?? [],
    github: p.links?.github ?? '', linkedin: p.links?.linkedin ?? '', portfolio: p.links?.portfolio ?? '',
  };
}

const num = (s: string) => (s.trim() === '' ? null : Number(s));
const yesNo = (b: boolean | undefined) => (b === true ? 'yes' : b === false ? 'no' : '');
const toBool = (s: string) => (s === 'yes' ? true : s === 'no' ? false : null);
const income = (s: string) => { const v = incomeDigits(s); return v === '' ? null : Number(v); };
const url = (s: string) => { const v = s.trim(); return !v ? '' : /^https?:\/\//i.test(v) ? v : `https://${v}`; };

export function toPatch(d: Draft, original: User, completeOnboarding = false): ProfilePatch {
  const profile: ProfilePatch['profile'] = {
    degree: d.degree, branch: d.branch.trim(),
    currentYear: num(d.currentYear) as number, graduationYear: num(d.graduationYear) as number, cgpa: num(d.cgpa.trim()) as number,
    skills: d.skills, interests: d.interests, careerGoal: d.careerGoal.trim(), headline: d.headline.trim(),
    workModes: d.workModes, preferredLocations: d.locations,
    homeState: (d.homeState || null) as string, annualFamilyIncomeINR: income(d.income) as number,
    gender: (d.gender || null) as Profile['gender'], socialCategory: (d.socialCategory || null) as Profile['socialCategory'], parentService: (d.parentService || null) as Profile['parentService'],
    disability: toBool(d.disability) as boolean, minority: toBool(d.minority) as boolean, firstGeneration: toBool(d.firstGeneration) as boolean,
    projects: d.projects.filter((p) => p.title.trim()).map((p) => ({ title: p.title.trim(), description: p.description?.trim(), skills: p.skills ?? [], url: url(p.url ?? '') })),
    experience: d.experience.filter((x) => x.role.trim() && x.organization.trim()).map((x) => ({ role: x.role.trim(), organization: x.organization.trim(), description: x.description?.trim() || undefined, startDate: x.startDate ?? null, endDate: x.endDate ?? null })),
    achievements: d.achievements,
    links: { github: url(d.github), linkedin: url(d.linkedin), portfolio: url(d.portfolio) },
  };
  if (d.college && d.college.id !== original.profile.collegeId) profile.collegeId = d.college.id;
  else if (!d.college && d.customCollege.trim().length >= 2) profile.customCollegeName = d.customCollege.trim();
  return { name: d.name.trim() || undefined, profile, ...(completeOnboarding ? { completeOnboarding: true } : {}) };
}

type FormProps = { draft: Draft; set: (p: Partial<Draft>) => void; errors?: FieldErrors };

export function CollegePicker({ draft, set, errors = {} }: FormProps) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<College[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [notListed, setNotListed] = useState(Boolean(draft.customCollege));
  const query = q.trim(); // spaces alone show the full list
  useEffect(() => {
    let live = true;
    setResults(null);
    setFailed(false);
    const t = setTimeout(() => api.colleges(query || undefined).then((r) => live && setResults(r)).catch(() => live && setFailed(true)), 200);
    return () => { live = false; clearTimeout(t); };
  }, [query]);
  if (draft.college) {
    return (
      <div className="card soft row">
        <div className="grow"><p className="faint" style={{ margin: 0 }}>Your institution</p><strong>{draft.college.name}</strong></div>
        <button type="button" className="btn small ghost" onClick={() => set({ college: null })}>Change</button>
      </div>
    );
  }
  if (notListed) {
    return (
      <>
        <Field label="Institution name" error={errors.college} hint="We'll add it to SarthiAI. Campus notices appear once your college joins.">
          <input id={fieldId('college')} className="input" value={draft.customCollege} onChange={(e) => set({ customCollege: e.target.value })} placeholder="e.g. Government Engineering College, Ajmer" />
        </Field>
        <button type="button" className="link-btn small" onClick={() => { setNotListed(false); set({ customCollege: '' }); }}>Search the list instead</button>
      </>
    );
  }
  return (
    <div className="field">
      <span>Search your college</span>
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, short name or city" aria-label="Search your college" />
      <ul className="list card" style={{ padding: '4px 14px', marginTop: 8 }} aria-busy={results === null}>
        {(results ?? []).slice(0, 8).map((c) => (
          <li key={c.id}>
            <button type="button" className="row" style={{ width: '100%', padding: '10px 0', background: 'none', border: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => set({ college: { id: c.id, name: c.name }, customCollege: '' })}>
              <span className="grow"><strong>{c.name}</strong><br /><span className="faint">{[c.city, c.state].filter(Boolean).join(', ')}</span></span>
            </button>
          </li>
        ))}
        {results === null && !failed && <li className="faint" style={{ padding: '10px 0' }}>Searching…</li>}
        {failed && <li className="faint" style={{ padding: '10px 0' }}>Couldn’t load colleges. Check your connection.</li>}
        {results?.length === 0 && <li className="faint" style={{ padding: '10px 0' }}>No matches for “{query}”.</li>}
      </ul>
      <button type="button" className="link-btn small" style={{ marginTop: 10 }} onClick={() => { setNotListed(true); set({ customCollege: draft.customCollege || query }); }}>My institution isn't listed</button>
    </div>
  );
}

export function EducationFields({ draft, set, errors = {} }: FormProps) {
  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 1 + i);
  return (
    <>
      <div className="grid-2">
        <Field label="Degree" error={errors.degree}>
          <select id={fieldId('degree')} className="input" value={draft.degree} onChange={(e) => set({ degree: e.target.value })} required>
            <option value="">Select…</option>
            {DEGREES.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
        <div className="field">
          <label htmlFor={fieldId('branch')}>Branch / major (optional)</label>
          <input id={fieldId('branch')} className="input" list="branches" value={draft.branch} onChange={(e) => set({ branch: e.target.value })} placeholder="e.g. Computer Science and Engineering" maxLength={80} />
          <datalist id="branches">{BRANCHES.map((b) => <option key={b} value={b} />)}</datalist>
        </div>
        <Field label="Current year of study" error={errors.currentYear}>
          <select id={fieldId('currentYear')} className="input" value={draft.currentYear} onChange={(e) => set({ currentYear: e.target.value })} required>
            <option value="">Select…</option>
            {[1, 2, 3, 4, 5, 6].map((y) => <option key={y} value={y}>Year {y}</option>)}
          </select>
        </Field>
        <Field label="Graduation year (optional)" error={errors.graduationYear}>
          <select id={fieldId('graduationYear')} className="input" value={draft.graduationYear} onChange={(e) => set({ graduationYear: e.target.value })}>
            <option value="">Select…</option>
            {years.map((y) => <option key={y}>{y}</option>)}
          </select>
        </Field>
      </div>
      <Field label="CGPA (optional, out of 10)" error={errors.cgpa} hint="Used only to check minimum-CGPA rules. Leave blank if you prefer.">
        <input id={fieldId('cgpa')} className="input" inputMode="decimal" value={draft.cgpa} onChange={(e) => set({ cgpa: e.target.value })} placeholder="e.g. 8.2" />
      </Field>
    </>
  );
}

export function InterestFields({ draft, set, errors = {} }: FormProps) {
  return (
    <>
      <TokenEditor id={fieldId('skills')} error={errors.skills} label="Skills" tokens={draft.skills} onChange={(skills) => set({ skills })} suggestions={SKILLS} max={30} maxLength={40} placeholder="Add a skill (e.g. Python, ML, React)" />
      <TokenEditor id={fieldId('interests')} error={errors.interests} label="Interests" tokens={draft.interests} onChange={(interests) => set({ interests })} suggestions={INTERESTS} max={30} maxLength={40} placeholder="Add an interest" />
      <Field label="Career goal" error={errors.careerGoal} hint="One line is enough. Sarthi uses it to rank matches and plan your roadmap.">
        <input id={fieldId('careerGoal')} className="input" value={draft.careerGoal} onChange={(e) => set({ careerGoal: e.target.value })} placeholder="e.g. Become a security analyst" maxLength={300} />
      </Field>
    </>
  );
}

export function PreferenceFields({ draft, set, errors = {} }: FormProps) {
  const toggle = (m: 'remote' | 'hybrid' | 'onsite') => set({ workModes: draft.workModes.includes(m) ? draft.workModes.filter((x) => x !== m) : [...draft.workModes, m] });
  return (
    <>
      <div className="field">
        <span>Work modes you prefer</span>
        <div className="chips">
          {(['remote', 'hybrid', 'onsite'] as const).map((m) => (
            <button type="button" key={m} className={`chip ${draft.workModes.includes(m) ? 'on' : ''}`} onClick={() => toggle(m)} aria-pressed={draft.workModes.includes(m)}>
              {m === 'onsite' ? 'On-site' : m[0].toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <TokenEditor label="Preferred locations" tokens={draft.locations} onChange={(locations) => set({ locations })} suggestions={LOCATIONS} max={10} placeholder="Add a city" />
      <div className="card soft" style={{ marginTop: 8 }}>
        <p className="faint">Private — scholarship checks only</p>
        <p className="small muted">All optional. Used only to check scholarship rules (income, domicile, and schemes for particular groups). Never sent to the AI and never shown to your college.</p>
        <div className="grid-2">
          <Field label="Home state" error={errors.homeState}>
            <select id={fieldId('homeState')} className="input" value={draft.homeState} onChange={(e) => set({ homeState: e.target.value })}>
              <option value="">Prefer not to say</option>
              <optgroup label="States">{STATES.map((s) => <option key={s}>{s}</option>)}</optgroup>
              <optgroup label="Union territories">{UNION_TERRITORIES.map((s) => <option key={s}>{s}</option>)}</optgroup>
              <option value={OTHER_STATE}>Other (outside India)</option>
            </select>
          </Field>
          <Field label="Annual family income (₹)" error={errors.income}>
            <input id={fieldId('income')} className="input" inputMode="numeric" value={draft.income} onChange={(e) => set({ income: e.target.value })} placeholder="Prefer not to say" />
          </Field>
          <Field label="Gender">
            <select className="input" value={draft.gender} onChange={(e) => set({ gender: e.target.value })}>
              <option value="">Prefer not to say</option>
              {GENDERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Category">
            <select className="input" value={draft.socialCategory} onChange={(e) => set({ socialCategory: e.target.value })}>
              <option value="">Prefer not to say</option>
              {SOCIAL_CATEGORIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Disability (PwD, 40% or more)">
            <select className="input" value={draft.disability} onChange={(e) => set({ disability: e.target.value })}>
              <option value="">Prefer not to say</option><option value="yes">Yes</option><option value="no">No</option>
            </select>
          </Field>
          <Field label="Minority community">
            <select className="input" value={draft.minority} onChange={(e) => set({ minority: e.target.value })}>
              <option value="">Prefer not to say</option><option value="yes">Yes</option><option value="no">No</option>
            </select>
          </Field>
          <Field label="Parent or guardian’s service">
            <select className="input" value={draft.parentService} onChange={(e) => set({ parentService: e.target.value })}>
              <option value="">Prefer not to say</option>
              {PARENT_SERVICES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="First in family at college">
            <select className="input" value={draft.firstGeneration} onChange={(e) => set({ firstGeneration: e.target.value })}>
              <option value="">Prefer not to say</option><option value="yes">Yes</option><option value="no">No</option>
            </select>
          </Field>
        </div>
      </div>
    </>
  );
}

export function ProjectFields({ draft, set }: { draft: Draft; set: (p: Partial<Draft>) => void }) {
  const update = (i: number, p: Partial<Project>) => set({ projects: draft.projects.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  return (
    <>
      <ResumeImport draft={draft} set={set} />
      <Field label="Headline (optional)"><input className="input" value={draft.headline} onChange={(e) => set({ headline: e.target.value })} placeholder="e.g. 2nd-year CSE student building security tools" maxLength={160} /></Field>
      <div className="field">
        <span>Projects</span>
        <p className="tiny faint" style={{ marginTop: -2 }}>Skills used in projects also count towards your matches.</p>
        {draft.projects.map((p, i) => (
          <div key={i} className="card soft" style={{ marginBottom: 10 }}>
            <div className="row">
              <input className="input grow" value={p.title} onChange={(e) => update(i, { title: e.target.value })} placeholder="Project title" />
              <button type="button" className="icon-btn" aria-label="Remove project" onClick={() => set({ projects: draft.projects.filter((_, j) => j !== i) })}><IconTrash size={18} /></button>
            </div>
            <textarea className="input" style={{ marginTop: 8, minHeight: 70 }} value={p.description ?? ''} onChange={(e) => update(i, { description: e.target.value })} placeholder="What did you build? (1–2 lines)" />
            <input className="input" style={{ marginTop: 8 }} value={(p.skills ?? []).join(', ')} onChange={(e) => update(i, { skills: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="Skills used, comma separated" />
            <input className="input" style={{ marginTop: 8 }} value={p.url ?? ''} onChange={(e) => update(i, { url: e.target.value })} placeholder="Link (GitHub, demo…)" inputMode="url" />
          </div>
        ))}
        <button type="button" className="btn small secondary" onClick={() => set({ projects: [...draft.projects, { title: '', description: '', skills: [], url: '' }] })}><IconPlus size={16} /> Add project</button>
      </div>
      <div className="field">
        <span>Experience</span>
        {draft.experience.length === 0 && <p className="tiny faint" style={{ marginTop: -2 }}>Internships, jobs or club roles. Import them from your resume above.</p>}
        {draft.experience.map((x, i) => (
          <div key={i} className="card soft row" style={{ marginBottom: 8, alignItems: 'flex-start' }}>
            <div className="grow small"><strong>{x.role}</strong> · {x.organization}{x.description && <p className="faint" style={{ margin: '2px 0 0' }}>{x.description}</p>}</div>
            <button type="button" className="icon-btn" aria-label={`Remove ${x.role}`} onClick={() => set({ experience: draft.experience.filter((_, j) => j !== i) })}><IconTrash size={18} /></button>
          </div>
        ))}
      </div>
      <TokenEditor label="Achievements" tokens={draft.achievements} onChange={(achievements) => set({ achievements })} max={20} placeholder="e.g. Top 10 in college CTF 2026" />
      <div className="grid-2">
        <Field label="GitHub"><input className="input" inputMode="url" value={draft.github} onChange={(e) => set({ github: e.target.value })} placeholder="github.com/you" /></Field>
        <Field label="LinkedIn"><input className="input" inputMode="url" value={draft.linkedin} onChange={(e) => set({ linkedin: e.target.value })} placeholder="linkedin.com/in/you" /></Field>
      </div>
      <Field label="Portfolio"><input className="input" inputMode="url" value={draft.portfolio} onChange={(e) => set({ portfolio: e.target.value })} placeholder="yoursite.dev" /></Field>
    </>
  );
}

/**
 * "Fill from my resume": reads a PDF on the server (no AI) and shows what it
 * found. Only the items the student keeps are added to the form; nothing is
 * saved until they press Save profile.
 */
export function ResumeImport({ draft, set }: FormProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [found, setFound] = useState<ResumeSuggestions | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pick, setPick] = useState<{ skills: Set<string>; projects: Set<number>; experience: Set<number> }>({ skills: new Set(), projects: new Set(), experience: new Set() });
  const [keepFile, setKeepFile] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const read = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setErr(null);
    try {
      const s = await api.parseResume(f);
      setFound(s); setFile(f);
      setPick({ skills: new Set(s.skills), projects: new Set(s.projects.map((_, i) => i)), experience: new Set(s.experience.map((_, i) => i)) });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };
  const flip = <T,>(setOf: Set<T>, v: T) => { const n = new Set(setOf); if (n.has(v)) n.delete(v); else n.add(v); return n; };
  const apply = async () => {
    if (!found) return;
    set({
      skills: [...draft.skills, ...found.skills.filter((x) => pick.skills.has(x))].slice(0, 30),
      projects: [...draft.projects, ...found.projects.filter((_, i) => pick.projects.has(i)).map((p) => ({ title: p.title, description: p.description ?? '', skills: p.skills ?? [], url: '' }))].slice(0, 20),
      experience: [...draft.experience, ...found.experience.filter((_, i) => pick.experience.has(i))].slice(0, 20),
    });
    if (keepFile && file) api.uploadDocument('resume', file).catch(() => {});
    setFound(null);
  };
  const nothing = found && !found.skills.length && !found.projects.length && !found.experience.length;
  return (
    <div className="card soft" style={{ marginBottom: 14 }}>
      <div className="row">
        <span className="grow small"><strong>Fill from my resume</strong><br /><span className="faint">PDF up to 2 MB. Read on SarthiAI’s server, not by the AI. You choose what to add.</span></span>
        <input ref={ref} type="file" accept="application/pdf,.pdf" hidden aria-hidden="true" tabIndex={-1} data-testid="resume-file" onChange={(e) => read(e.target.files?.[0])} />
        <button type="button" className="btn small secondary" onClick={() => ref.current?.click()} disabled={busy}>{busy ? 'Reading…' : 'Choose PDF'}</button>
      </div>
      {err && <div className="notice coral small" role="alert" style={{ marginTop: 10 }}>{err}</div>}
      <Sheet open={Boolean(found)} onClose={() => setFound(null)} title="Found in your resume">
        {nothing ? <p className="small muted">Nothing new found: your profile already has these, or the resume’s sections couldn’t be read.</p> : (
          <>
            <p className="small muted">Untick anything that’s wrong. You can edit everything afterwards.</p>
            {found && found.skills.length > 0 && (<div className="field"><span>Skills</span><div className="chips">{found.skills.map((x) => (
              <button type="button" key={x} className={`chip ${pick.skills.has(x) ? 'on' : ''}`} aria-pressed={pick.skills.has(x)} onClick={() => setPick({ ...pick, skills: flip(pick.skills, x) })}>{x}</button>
            ))}</div></div>)}
            {found && found.projects.length > 0 && (<div className="field"><span>Projects</span>{found.projects.map((p, i) => (
              <label key={i} className="check small" style={{ alignItems: 'flex-start' }}><input type="checkbox" checked={pick.projects.has(i)} onChange={() => setPick({ ...pick, projects: flip(pick.projects, i) })} /> <span><strong>{p.title}</strong>{p.skills?.length ? ` · ${p.skills.join(', ')}` : ''}</span></label>
            ))}</div>)}
            {found && found.experience.length > 0 && (<div className="field"><span>Experience</span>{found.experience.map((x, i) => (
              <label key={i} className="check small"><input type="checkbox" checked={pick.experience.has(i)} onChange={() => setPick({ ...pick, experience: flip(pick.experience, i) })} /> <span><strong>{x.role}</strong> · {x.organization}</span></label>
            ))}</div>)}
            <label className="check small"><input type="checkbox" checked={keepFile} onChange={(e) => setKeepFile(e.target.checked)} /> Also keep this PDF in Your documents</label>
            <button type="button" className="btn block" style={{ marginTop: 8 }} onClick={apply}>Add to my profile</button>
            <p className="tiny faint" style={{ marginTop: 8 }}>Then press Save profile to keep the changes.</p>
          </>
        )}
      </Sheet>
    </div>
  );
}
