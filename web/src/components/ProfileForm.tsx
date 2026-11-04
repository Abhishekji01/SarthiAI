import { useEffect, useState } from 'react';
import { api, type ProfilePatch } from '../lib/api';
import type { College, Profile, Project, User } from '../lib/types';
import { Field, TokenEditor } from './ui';
import { IconPlus, IconTrash } from './icons';

export const DEGREES = ['B.Tech', 'B.E.', 'BCA', 'B.Sc', 'BS', 'B.Com', 'BA', 'BBA', 'B.Arch', 'B.Pharm', 'MBBS', 'B.Des', 'LLB', 'M.Tech', 'M.E.', 'MCA', 'M.Sc', 'MBA', 'MA', 'Diploma', 'Integrated', 'PhD', 'Other'];
export const BRANCHES = ['Computer Science and Engineering', 'Information Technology', 'AI & Machine Learning', 'Data Science', 'Cybersecurity', 'Electronics and Communication', 'Electrical Engineering', 'Mechanical Engineering', 'Civil Engineering', 'Chemical Engineering', 'Biotechnology'];
export const SKILLS = ['Python', 'Java', 'C++', 'JavaScript', 'React', 'Node.js', 'SQL', 'Git', 'Linux', 'Networking', 'Machine Learning', 'Data Analysis', 'Web Security', 'Android', 'Figma', 'Communication'];
export const INTERESTS = ['Scholarships', 'Internships', 'Research', 'AI/ML', 'Cybersecurity', 'Web Development', 'Open Source', 'Hackathons', 'Data Science', 'Government programmes', 'Startups', 'Space science'];
export const STATES = ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Other'];
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
  projects: Project[]; achievements: string[];
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
    projects: (p.projects ?? []).map((x) => ({ title: x.title, description: x.description ?? '', skills: x.skills ?? [], url: x.url ?? '' })),
    achievements: p.achievements ?? [],
    github: p.links?.github ?? '', linkedin: p.links?.linkedin ?? '', portfolio: p.links?.portfolio ?? '',
  };
}

const num = (s: string) => (s.trim() === '' ? null : Number(s));
const url = (s: string) => { const v = s.trim(); return !v ? '' : /^https?:\/\//i.test(v) ? v : `https://${v}`; };

export function toPatch(d: Draft, original: User, completeOnboarding = false): ProfilePatch {
  const profile: ProfilePatch['profile'] = {
    degree: d.degree, branch: d.branch.trim(),
    currentYear: num(d.currentYear) as number, graduationYear: num(d.graduationYear) as number, cgpa: num(d.cgpa) as number,
    skills: d.skills, interests: d.interests, careerGoal: d.careerGoal.trim(), headline: d.headline.trim(),
    workModes: d.workModes, preferredLocations: d.locations,
    homeState: (d.homeState || null) as string, annualFamilyIncomeINR: num(d.income) as number,
    projects: d.projects.filter((p) => p.title.trim()).map((p) => ({ title: p.title.trim(), description: p.description?.trim(), skills: p.skills ?? [], url: url(p.url ?? '') })),
    achievements: d.achievements,
    links: { github: url(d.github), linkedin: url(d.linkedin), portfolio: url(d.portfolio) },
  };
  if (d.college && d.college.id !== original.profile.collegeId) profile.collegeId = d.college.id;
  else if (!d.college && d.customCollege.trim().length >= 2) profile.customCollegeName = d.customCollege.trim();
  return { name: d.name.trim() || undefined, profile, ...(completeOnboarding ? { completeOnboarding: true } : {}) };
}

export function CollegePicker({ draft, set }: { draft: Draft; set: (p: Partial<Draft>) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<College[]>([]);
  const [notListed, setNotListed] = useState(Boolean(draft.customCollege));
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => api.colleges(q || undefined).then((r) => live && setResults(r)).catch(() => {}), 200);
    return () => { live = false; clearTimeout(t); };
  }, [q]);
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
        <Field label="Institution name" hint="We'll add it to SarthiAI. Campus notices appear once your college joins.">
          <input className="input" value={draft.customCollege} onChange={(e) => set({ customCollege: e.target.value })} placeholder="e.g. Government Engineering College, Ajmer" />
        </Field>
        <button type="button" className="link-btn small" onClick={() => setNotListed(false)}>Search the list instead</button>
      </>
    );
  }
  return (
    <div className="field">
      <span>Search your college</span>
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, short name or city" />
      <ul className="list card" style={{ padding: '4px 14px', marginTop: 8 }}>
        {results.slice(0, 8).map((c) => (
          <li key={c.id}>
            <button type="button" className="row" style={{ width: '100%', padding: '10px 0', background: 'none', border: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => set({ college: { id: c.id, name: c.name }, customCollege: '' })}>
              <span className="grow"><strong>{c.name}</strong><br /><span className="faint">{[c.city, c.state].filter(Boolean).join(', ')}</span></span>
            </button>
          </li>
        ))}
        {results.length === 0 && <li className="faint" style={{ padding: '10px 0' }}>No matches.</li>}
      </ul>
      <button type="button" className="link-btn small" style={{ marginTop: 10 }} onClick={() => setNotListed(true)}>My institution isn't listed</button>
    </div>
  );
}

export function EducationFields({ draft, set }: { draft: Draft; set: (p: Partial<Draft>) => void }) {
  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 1 + i);
  return (
    <>
      <div className="grid-2">
        <Field label="Degree">
          <select className="input" value={draft.degree} onChange={(e) => set({ degree: e.target.value })}>
            <option value="">Select…</option>
            {DEGREES.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Branch / major">
          <input className="input" list="branches" value={draft.branch} onChange={(e) => set({ branch: e.target.value })} placeholder="e.g. Computer Science and Engineering" />
          <datalist id="branches">{BRANCHES.map((b) => <option key={b} value={b} />)}</datalist>
        </Field>
        <Field label="Current year of study">
          <select className="input" value={draft.currentYear} onChange={(e) => set({ currentYear: e.target.value })}>
            <option value="">Select…</option>
            {[1, 2, 3, 4, 5, 6].map((y) => <option key={y} value={y}>Year {y}</option>)}
          </select>
        </Field>
        <Field label="Graduation year">
          <select className="input" value={draft.graduationYear} onChange={(e) => set({ graduationYear: e.target.value })}>
            <option value="">Select…</option>
            {years.map((y) => <option key={y}>{y}</option>)}
          </select>
        </Field>
      </div>
      <Field label="CGPA (optional, out of 10)" hint="Used only to check minimum-CGPA rules. Leave blank if you prefer.">
        <input className="input" inputMode="decimal" value={draft.cgpa} onChange={(e) => set({ cgpa: e.target.value.replace(/[^\d.]/g, '') })} placeholder="e.g. 8.2" />
      </Field>
    </>
  );
}

export function InterestFields({ draft, set }: { draft: Draft; set: (p: Partial<Draft>) => void }) {
  return (
    <>
      <TokenEditor label="Skills" tokens={draft.skills} onChange={(skills) => set({ skills })} suggestions={SKILLS} placeholder="Add a skill (e.g. Python, ML, React)" />
      <TokenEditor label="Interests" tokens={draft.interests} onChange={(interests) => set({ interests })} suggestions={INTERESTS} max={20} placeholder="Add an interest" />
      <Field label="Career goal" hint="One line is enough. Sarthi uses it to rank matches and plan your roadmap.">
        <input className="input" value={draft.careerGoal} onChange={(e) => set({ careerGoal: e.target.value })} placeholder="e.g. Become a security analyst" maxLength={300} />
      </Field>
    </>
  );
}

export function PreferenceFields({ draft, set }: { draft: Draft; set: (p: Partial<Draft>) => void }) {
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
        <p className="small muted">Optional. Used only to check income and domicile rules. Never sent to the AI and never shown to your college.</p>
        <div className="grid-2">
          <Field label="Home state">
            <select className="input" value={draft.homeState} onChange={(e) => set({ homeState: e.target.value })}>
              <option value="">Prefer not to say</option>
              {STATES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Annual family income (₹)">
            <input className="input" inputMode="numeric" value={draft.income} onChange={(e) => set({ income: e.target.value.replace(/\D/g, '') })} placeholder="Prefer not to say" />
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
      <TokenEditor label="Achievements" tokens={draft.achievements} onChange={(achievements) => set({ achievements })} max={20} placeholder="e.g. Top 10 in college CTF 2026" />
      <div className="grid-2">
        <Field label="GitHub"><input className="input" inputMode="url" value={draft.github} onChange={(e) => set({ github: e.target.value })} placeholder="github.com/you" /></Field>
        <Field label="LinkedIn"><input className="input" inputMode="url" value={draft.linkedin} onChange={(e) => set({ linkedin: e.target.value })} placeholder="linkedin.com/in/you" /></Field>
      </div>
      <Field label="Portfolio"><input className="input" inputMode="url" value={draft.portfolio} onChange={(e) => set({ portfolio: e.target.value })} placeholder="yoursite.dev" /></Field>
    </>
  );
}
