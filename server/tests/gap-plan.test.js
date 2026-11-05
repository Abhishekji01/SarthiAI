import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { connectTestDb, disconnectTestDb, registerStudent, auth, createOpportunity, setProfile } from './helpers.js';
import { Resource } from '../src/models/Resource.js';

let app;
let s;
beforeAll(async () => {
  app = await connectTestDb('gapplan');
  s = await registerStudent(app);
  // Knows Python, wants backend work, has not added a CGPA.
  await setProfile(app, s.token, { degree: 'B.Tech', branch: 'CSE', currentYear: 3, skills: ['Python'], careerGoal: 'Backend software developer' });
  await Resource.create({ title: 'SQLBolt', provider: 'SQLBolt', url: 'https://sqlbolt.com/', skills: ['sql'], verifiedAt: new Date() });

  await createOpportunity({ title: 'Backend Intern', opportunityType: 'internship', requiredSkills: ['Python', 'SQL'], tags: ['role-software'] });
  await createOpportunity({ title: 'SDE I', opportunityType: 'job', requiredSkills: ['MySQL'], tags: ['role-software'] }); // alias of SQL
  await createOpportunity({ title: 'Platform Engineer', opportunityType: 'job', requiredSkills: ['SQL', 'Docker'], tags: ['role-software'] });
  await createOpportunity({ title: 'Python Developer', opportunityType: 'job', requiredSkills: ['Python'], tags: ['role-software'] }); // ready now
  await createOpportunity({ title: 'UI/UX Designer', opportunityType: 'job', requiredSkills: ['Figma'], tags: ['role-design'] }); // not their goal
  await createOpportunity({ title: 'MBA Analyst', opportunityType: 'job', requiredSkills: ['Excel'], eligibleDegrees: ['MBA'], tags: ['role-software'] }); // wrong degree
  await createOpportunity({ title: 'Backend Engineer (CGPA 7+)', opportunityType: 'job', requiredSkills: ['Python'], minimumCGPA: 7, tags: ['role-software'] });
  await createOpportunity({
    title: 'Junior Backend Developer', opportunityType: 'job', requiredSkills: ['Python'], tags: ['role-software'],
    eligibilityRules: [{ key: 'experience', kind: 'self_declared', label: 'At least 1 year of relevant experience', mandatory: true }],
  });
  await createOpportunity({ title: 'Old Backend Role', opportunityType: 'job', requiredSkills: ['SQL'], deadline: new Date(Date.now() - 86400000) });
});
afterAll(disconnectTestDb);

describe('gap-to-plan', () => {
  it('ranks the skill that unlocks the most opportunities first, alias-aware', async () => {
    const res = await request(app).get('/api/me/plan').set(auth(s.token));
    expect(res.status).toBe(200);
    const plan = res.body.data;
    expect(plan.skills[0]).toMatchObject({ id: 'sql', unlocks: 2, required: 3 });       // Backend Intern + SDE I (MySQL)
    expect(plan.skills[0].resources.map((r) => r.title)).toEqual(['SQLBolt']);          // catalogue links only
    expect(plan.skills.find((x) => x.id === 'devops')).toMatchObject({ required: 1, unlocks: 0 });
    expect(plan.headline).toMatch(/Learn SQL/);
  });

  it('separates quick wins, experience, and what cannot be fixed now', async () => {
    const plan = (await request(app).get('/api/me/plan').set(auth(s.token))).body.data;
    expect(plan.quickWins.map((q) => q.field)).toContain('cgpa');
    expect(plan.steps[0]).toMatchObject({ kind: 'profile' });
    expect(plan.experience.map((o) => o.title)).toEqual(['Junior Backend Developer']);
    expect(plan.summary.notFixable).toBe(1);   // MBA-only
    expect(plan.summary.roleMismatch).toBe(1); // designer
    expect(plan.summary.closed).toBe(1);       // past deadline is never planned for
    expect(plan.summary.readyNow).toBeGreaterThanOrEqual(1);
    const allTitles = JSON.stringify(plan);
    expect(allTitles).not.toMatch(/MBA Analyst|UI\/UX Designer|Old Backend Role/);
  });

  it('dates each step inside the 90-day horizon and labels effort as an estimate', async () => {
    const plan = (await request(app).get('/api/me/plan').set(auth(s.token))).body.data;
    const skillSteps = plan.steps.filter((x) => x.kind === 'skill');
    expect(skillSteps[0].title).toBe('Learn SQL');
    expect(skillSteps[0].effortEstimate).toMatch(/estimate/);
    expect(skillSteps[0].applyTo.map((o) => o.title)).toEqual(expect.arrayContaining(['Backend Intern', 'SDE I']));
    for (const st of skillSteps) expect(new Date(st.targetDate) - Date.now()).toBeLessThanOrEqual(91 * 86400000);
    for (let i = 1; i < skillSteps.length; i += 1) expect(new Date(skillSteps[i].startsAt) >= new Date(skillSteps[i - 1].targetDate)).toBe(true);
  });

  it('adds the plan to the roadmap without duplicating or removing milestones', async () => {
    await request(app).post('/api/roadmap/milestones').set(auth(s.token)).send({ title: 'My own milestone' });
    const first = await request(app).post('/api/me/plan/roadmap').set(auth(s.token));
    expect(first.status).toBe(201);
    expect(first.body.data.added).toBeGreaterThanOrEqual(2);
    const titles = first.body.data.roadmap.milestones.map((m) => m.title);
    expect(titles).toEqual(expect.arrayContaining(['My own milestone', 'Learn SQL']));
    const sql = first.body.data.roadmap.milestones.find((m) => m.title === 'Learn SQL');
    expect(sql).toMatchObject({ source: 'plan', priority: 'high' });
    expect(sql.targetDate).toBeTruthy();
    expect(sql.verifiedResources.map((r) => r.title)).toEqual(['SQLBolt']);
    const again = await request(app).post('/api/me/plan/roadmap').set(auth(s.token));
    expect(again.body.data.added).toBe(0);
  });

  it('fits shorter skills after a long one and merges closely related skills', async () => {
    const ml = await registerStudent(app);
    await setProfile(app, ml.token, { degree: 'B.Tech', currentYear: 3, cgpa: 8, skills: ['Python'], careerGoal: 'Machine learning engineer' });
    for (let i = 0; i < 3; i += 1) await createOpportunity({ title: `ML Intern ${i}`, opportunityType: 'internship', requiredSkills: ['Machine Learning'], tags: ['role-ml-ai'] });
    await createOpportunity({ title: 'Data Scientist', opportunityType: 'job', requiredSkills: ['Deep Learning', 'Machine Learning'], tags: ['role-ml-ai'] });
    await createOpportunity({ title: 'ML Data Intern', opportunityType: 'internship', requiredSkills: ['Databases'], tags: ['role-ml-ai'] });
    const plan = (await request(app).get('/api/me/plan').set(auth(ml.token))).body.data;
    const skillSteps = plan.steps.filter((x) => x.kind === 'skill').map((x) => x.skillId);
    expect(skillSteps[0]).toBe('machinelearning');             // 8 weeks
    expect(skillSteps).not.toContain('deeplearning');          // related to ML (0.9): learned together
    expect(skillSteps.filter((x) => ['sql', 'databases'].includes(x)).length).toBeLessThanOrEqual(1);
    expect(skillSteps.length).toBeGreaterThan(1);              // a shorter skill still fits after ML
  });

  it('a student with nothing in the profile gets profile steps, not invented skills', async () => {
    const empty = await registerStudent(app);
    const plan = (await request(app).get('/api/me/plan').set(auth(empty.token))).body.data;
    expect(plan.quickWins.length).toBeGreaterThan(0);
    expect(plan.steps[0].kind).toBe('profile');
  });
});
