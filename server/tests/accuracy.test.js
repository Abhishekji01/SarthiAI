import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, disconnectTestDb, registerStudent, auth, createOpportunity, setProfile } from './helpers.js';
import { compareSkills, canonical, canonicalState } from '../src/matching/taxonomy.js';
import { rankByQuery } from '../src/matching/search.js';
import { checkEligibility, estimateCurrentYear } from '../src/eligibility/engine.js';
import { scoreOpportunity } from '../src/matching/engine.js';
import { extractDates, extractAmounts, buildEvidence, findUngroundedClaims } from '../src/ai/grounding.js';
import { setAIProvider } from '../src/ai/provider.js';

const NOW = new Date('2026-11-03T10:00:00+05:30');
const base = { verificationStatus: 'verified', lastVerifiedAt: NOW, declaredStatus: 'open', deadline: new Date('2026-12-20T23:59:59+05:30') };

describe('skill taxonomy', () => {
  it('treats aliases as the same skill and related skills as partial', () => {
    expect(canonical('JS')).toBe(canonical('JavaScript'));
    expect(canonical('Machine-Learning')).toBe(canonical('ML'));
    expect(canonical('C++')).toBe('cpp');
    const cmp = compareSkills(['js', 'React', 'Py'], ['JavaScript', 'TypeScript', 'Python', 'Kubernetes']);
    expect(cmp.exact.map((m) => m.skill)).toEqual(['JavaScript', 'Python']);
    expect(cmp.related.map((m) => m.skill)).toContain('TypeScript');
    expect(cmp.missing).toEqual(['Kubernetes']);
  });

  it('normalises Indian state abbreviations', () => {
    expect(canonicalState('UP')).toBe(canonicalState('Uttar Pradesh'));
    expect(canonicalState('Orissa')).toBe(canonicalState('Odisha'));
  });
});

describe('ranked search', () => {
  const docs = [
    { _id: 1, title: 'Machine Learning Research Internship', organization: 'IISc', opportunityType: 'internship', tags: ['ai'] },
    { _id: 2, title: 'Pragati Scholarship', organization: 'AICTE', opportunityType: 'scholarship', tags: ['government'], eligibilityRules: [{ label: 'Applicant is a girl student' }] },
    { _id: 3, title: 'Web Development Bootcamp', organization: 'Example', opportunityType: 'program', requiredSkills: ['React', 'Node.js'] },
    { _id: 4, title: 'Space Science Fellowship', organization: 'ISRO', opportunityType: 'fellowship', officialDescription: 'Research with satellite data.' },
  ];
  const ids = (q) => rankByQuery(docs, q).results.map((r) => r.doc._id);

  it('understands abbreviations and phrases', () => {
    expect(ids('ML internship')).toEqual([1]);
    expect(ids('artificial intelligence')).toContain(1);
    expect(ids('reactjs')).toEqual([3]);
  });

  it('tolerates typos and plurals', () => {
    expect(ids('scholarshp')).toEqual([2]);
    expect(ids('internships')).toEqual([1]);
    expect(ids('fellowhsip')).toEqual([4]);
  });

  it('searches eligibility text, e.g. who a scholarship is for', () => {
    expect(ids('scholarships for girls')).toEqual([2]);
  });

  it('keeps topic searches precise on long real-world descriptions', () => {
    const long = (extra) => ` We build software. Experience with data analysis, AI tools, Excel and dashboards is a plus. ${extra}`;
    const jobs = [
      { _id: 'ml', title: 'Machine Learning Intern', organization: 'A', opportunityType: 'internship', officialDescription: long('') },
      { _id: 'be', title: 'Backend Engineer', organization: 'B', opportunityType: 'job', officialDescription: long('You will be reacting quickly to customer needs.') },
      { _id: 'rn', title: 'Mobile Developer', organization: 'C', opportunityType: 'job', officialDescription: long('We use React Native.') },
      { _id: 'ai', title: 'AI Engineer', organization: 'D', opportunityType: 'job', officialDescription: long('') },
    ];
    // Related concepts count in titles (AI Engineer), not because a description mentions "AI tools".
    expect(rankByQuery(jobs, 'machine learning').results.map((r) => r.doc._id)).toEqual(['ml', 'ai']);
    expect(rankByQuery(jobs, 'react').results.map((r) => r.doc._id)).toEqual(['rn']);
    // A related title (Frontend → React) still appears, but below a listing that names React.
    const fe = { _id: 'fe', title: 'Frontend Engineer', organization: 'E', opportunityType: 'job', officialDescription: long('') };
    expect(rankByQuery([fe, ...jobs], 'react').results.map((r) => r.doc._id)).toEqual(['rn', 'fe']);
  });

  it('holds back mere mentions when enough listings are about the topic', () => {
    const about = Array.from({ length: 5 }, (_, i) => ({ _id: `a${i}`, title: `Machine Learning Engineer ${i}`, organization: 'X', opportunityType: 'job' }));
    const mention = { _id: 'm', title: 'Backend Engineer', organization: 'Y', opportunityType: 'job', officialDescription: 'Experience with ML is a plus.' };
    const r = rankByQuery([...about, mention], 'machine learning');
    expect(r.results.map((x) => x.doc._id)).not.toContain('m');
    expect(r.hiddenMentions).toBe(1);
    expect(rankByQuery([...about, mention], 'machine learning', { includeMentions: true }).results.map((x) => x.doc._id)).toContain('m');
    // With few focused listings, mentions are still shown (more results).
    expect(rankByQuery([about[0], mention], 'machine learning').results).toHaveLength(2);
  });

  it('treats old and new Indian city names as the same place', () => {
    const events = [
      { _id: 'blr', title: 'BuildFest', organization: 'X', opportunityType: 'hackathon', location: { city: 'Bengaluru' } },
      { _id: 'ggn', title: 'HackNCR', organization: 'Y', opportunityType: 'hackathon', location: { city: 'Gurugram' } },
      { _id: 'job', title: 'Machine Learning Intern', organization: 'Z', opportunityType: 'internship', location: { city: 'Bengaluru' } },
    ];
    expect(rankByQuery(events, 'hackathon bangalore').results.map((r) => r.doc._id)).toEqual(['blr']);
    expect(rankByQuery(events, 'gurgaon').results.map((r) => r.doc._id)).toEqual(['ggn']);
    // A type word is a requirement: the internship that mentions hackathons is not a hackathon.
    events[2].officialDescription = 'Hackathon winners preferred.';
    expect(rankByQuery(events, 'hackathon bangalore').results.map((r) => r.doc._id)).toEqual(['blr']);
    expect(rankByQuery(events, 'bangalore internship').results.map((r) => r.doc._id)).toEqual(['job']);
  });

  it('relaxes to related results instead of returning nothing', () => {
    const r = rankByQuery(docs, 'isro satellite quantum');
    expect(r.relaxed).toBe(true);
    expect(r.results[0].doc._id).toBe(4);
    expect(rankByQuery(docs, 'ISRO').relaxed).toBe(false);
  });
});

describe('eligibility accuracy', () => {
  it('accepts degree families (UG / Engineering / any degree)', () => {
    const opp = { ...base, eligibilityRules: [{ key: 'deg', kind: 'degree_in', label: 'Any undergraduate degree', values: ['UG'] }] };
    expect(checkEligibility(opp, { degree: 'BCA' }, { now: NOW }).overall).toBe('all_criteria_met');
    expect(checkEligibility(opp, { degree: 'MBA' }, { now: NOW }).overall).toBe('likely_ineligible');
    const eng = { ...base, eligibleDegrees: ['Engineering'] };
    expect(checkEligibility(eng, { degree: 'B.E.' }, { now: NOW }).overall).toBe('all_criteria_met');
  });

  it('accepts "any branch" and flags specialisations of a listed branch for confirmation', () => {
    const any = { ...base, eligibleBranches: ['Any branch'] };
    expect(checkEligibility(any, { branch: 'Civil' }, { now: NOW }).overall).toBe('all_criteria_met');
    const cse = { ...base, eligibleBranches: ['CSE'] };
    const r = checkEligibility(cse, { branch: 'CSE (AI & ML)' }, { now: NOW });
    expect(r.criteria[0].status).toBe('unknown');
  });

  it('estimates year of study from graduation year (and says so)', () => {
    expect(estimateCurrentYear({ degree: 'B.Tech', graduationYear: 2029 }, NOW)).toEqual({ year: 2, estimated: true });
    const opp = { ...base, eligibleYears: [2, 3] };
    const r = checkEligibility(opp, { degree: 'B.Tech', graduationYear: 2029 }, { now: NOW });
    expect(r.overall).toBe('all_criteria_met');
    expect(r.criteria[0].explanation).toMatch(/estimated/);
  });

  it('never compares a percentage rule against a CGPA', () => {
    const opp = { ...base, eligibilityRules: [{ key: 'marks', kind: 'min_cgpa', label: 'At least 60% marks', numberValue: 60 }] };
    const r = checkEligibility(opp, { cgpa: 8.5 }, { now: NOW });
    expect(r.criteria[0].status).toBe('unknown');
  });

  it('matches home state by abbreviation and alias-aware skills', () => {
    const opp = { ...base, eligibilityRules: [
      { key: 'state', kind: 'home_state_in', label: 'Domicile of Uttar Pradesh', values: ['Uttar Pradesh'] },
      { key: 'sk', kind: 'skills_all', label: 'Knows JavaScript', values: ['JavaScript'] },
    ] };
    expect(checkEligibility(opp, { homeState: 'UP', skills: ['JS'] }, { now: NOW }).overall).toBe('all_criteria_met');
  });
});

describe('match scoring accuracy', () => {
  it('credits related skills, project skills, and goal fit', () => {
    const opp = { ...base, title: 'Frontend Engineering Internship', opportunityType: 'internship', requiredSkills: ['JavaScript'], preferredSkills: ['TypeScript'], tags: ['web development'] };
    const exact = scoreOpportunity(opp, { skills: ['JS'] }, { now: NOW });
    const viaProject = scoreOpportunity(opp, { skills: [], projects: [{ title: 'Portfolio', skills: ['JavaScript'] }] }, { now: NOW });
    const none = scoreOpportunity(opp, { skills: ['Accounting'] }, { now: NOW });
    expect(exact.score).toBeGreaterThan(none.score);
    expect(viaProject.score).toBeGreaterThan(none.score);
    expect(viaProject.factors.some((f) => /from your projects/.test(f.detail))).toBe(true);
    const withGoal = scoreOpportunity(opp, { skills: ['JS'], careerGoal: 'Become a frontend web developer' }, { now: NOW });
    expect(withGoal.score).toBeGreaterThan(exact.score);
    expect(withGoal.factors.some((f) => f.factor === 'goal')).toBe(true);
  });

  it('matches interests through concepts, not exact strings', () => {
    const opp = { ...base, title: 'Deep Learning Fellowship', opportunityType: 'fellowship', tags: ['deep learning'] };
    const r = scoreOpportunity(opp, { interests: ['AI'] }, { now: NOW });
    expect(r.factors.some((f) => f.factor === 'interests')).toBe(true);
  });
});

describe('grounding check', () => {
  it('extracts dates and rupee amounts in common Indian formats', () => {
    expect(extractDates('Apply by 30 November 2026 or Dec 5').map((d) => d.md)).toEqual(['11-30', '12-05']);
    expect(extractDates('due 2026-11-30')[0].ymd).toBe('2026-11-30');
    expect(extractAmounts('₹50,000 per year, or Rs 1.5 lakh').map((a) => a.value)).toEqual([50000, 150000]);
  });

  it('flags dates and amounts that no tool returned', () => {
    const ev = buildEvidence(['{"deadline":"2026-11-30","award":"INR 50000 per year"}']);
    expect(findUngroundedClaims('Deadline is 30 Nov 2026 and the award is ₹50,000.', ev)).toEqual([]);
    expect(findUngroundedClaims('Deadline is 15 Dec 2026 and the award is ₹75,000.', ev).map((c) => c.kind)).toEqual(['date', 'amount']);
  });
});

describe('API: more results and grounded chat', () => {
  let app;
  let s;
  beforeAll(async () => {
    app = await connectTestDb('accuracy');
    s = await registerStudent(app, { name: 'Asha Verma' });
    await setProfile(app, s.token, { degree: 'BTech', branch: 'CSE', currentYear: 3, skills: ['JS', 'Python'], interests: ['AI'] });
    await createOpportunity({ title: 'Applied ML Internship', requiredSkills: ['Machine Learning', 'Python'], eligibleYears: [3, 4], tags: ['ai'] });
    await createOpportunity({ title: 'Open Research Programme', opportunityType: 'program', tags: ['research'] });
  });
  afterEach(() => setAIProvider(undefined));
  afterAll(disconnectTestDb);

  it('finds listings by abbreviation through the search API', async () => {
    const res = await request(app).get('/api/opportunities?q=ml').set(auth(s.token));
    expect(res.body.data.map((o) => o.title)).toEqual(['Applied ML Internship']);
    expect(res.body.data[0].searchMatch.matchedTerms).toContain('machinelearning');
  });

  it('returns a labelled "possible" tier when asked for all matches', async () => {
    const strict = await request(app).get('/api/matches').set(auth(s.token));
    const all = await request(app).get('/api/matches?tier=all&limit=20').set(auth(s.token));
    expect(strict.body.data.map((o) => o.title)).toContain('Applied ML Internship');
    expect(strict.body.data.map((o) => o.title)).not.toContain('Open Research Programme');
    const possible = all.body.data.find((o) => o.title === 'Open Research Programme');
    expect(possible.tier).toBe('possible');
    expect(all.body.data.length).toBeGreaterThan(strict.body.data.length);
  });

  it('answers common questions without an AI key (quick answers)', async () => {
    setAIProvider(null);
    const res = await request(app).post('/api/ai/quick').set(auth(s.token)).send({ message: 'what do you recommend for me?' });
    expect(res.status).toBe(200);
    expect(res.body.data.reply).toMatch(/Applied ML Internship/);
    expect(res.body.data.model).toBe('sarthi-quick');
    const apply = await request(app).post('/api/ai/quick').set(auth(s.token)).send({ message: 'What should I apply to this month?' });
    expect(apply.body.data.toolsUsed).toEqual(['quick:recommend']);
  });

  it('asks the model to correct an invented deadline, and reports what it could not verify', async () => {
    const replies = [
      { text: '', toolCalls: [{ callId: 'r', name: 'get_recommendations', arguments: '{}' }], rawContent: { role: 'model', parts: [] } },
      { text: 'Apply to Applied ML Internship before 1 January 2031. It pays ₹99,999.', toolCalls: [] },
      { text: 'Apply to Applied ML Internship soon; the stipend is not published.', toolCalls: [] },
    ];
    const calls = [];
    setAIProvider({ model: 'fake', async respond(a) { calls.push(a); return replies.shift(); }, async structured() { throw new Error('unused'); } });
    const res = await request(app).post('/api/ai/chat').set(auth(s.token)).send({ messages: [{ role: 'user', content: 'What should I apply to?' }] });
    expect(res.status).toBe(200);
    expect(res.body.data.grounding.status).toBe('corrected');
    expect(res.body.data.reply).not.toMatch(/2031|99,999/);
    expect(calls).toHaveLength(3);
    expect(calls[2].input.at(-1).content).toMatch(/1 January 2031/);
  });
});
