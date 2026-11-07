import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { connectTestDb, disconnectTestDb, registerStudent, auth, createOpportunity, setProfile } from './helpers.js';

let app;
let s;
let opp;
beforeAll(async () => {
  app = await connectTestDb('eligibility_answers');
  s = await registerStudent(app);
  await setProfile(app, s.token, { degree: 'B.Tech', currentYear: 2 });
  opp = await createOpportunity({
    title: 'Guidelines Scholarship', opportunityType: 'scholarship', eligibleDegrees: ['B.Tech'],
    eligibilityRules: [{ key: 'guidelines', kind: 'self_declared', label: 'You meet every eligibility condition in the official guidelines', mandatory: true }],
  });
});
afterAll(disconnectTestDb);

const check = () => request(app).post('/api/eligibility/check').set(auth(s.token)).send({ opportunityId: String(opp._id) });
const listed = async () => (await request(app).get('/api/opportunities').query({ type: 'scholarship' }).set(auth(s.token))).body.data.find((o) => o.id === String(opp._id));
const put = (key, answer) => request(app).put('/api/eligibility/answers').set(auth(s.token)).send({ opportunityId: String(opp._id), key, answer });

describe('F4: remembered eligibility answers', () => {
  it('starts as "needs your confirmation"', async () => {
    expect((await check()).body.data.overall).toBe('missing_information');
    expect((await listed()).match.eligibilityOverall).toBe('missing_information');
  });

  it('saves an answer and uses it in the check and in rankings', async () => {
    expect((await put('guidelines', true)).status).toBe(200);
    const c = (await check()).body.data;
    expect(c.overall).toBe('all_criteria_met');
    expect(c.savedAnswers).toEqual({ guidelines: true });
    expect((await listed()).match.eligibilityOverall).toBe('all_criteria_met');
    const all = (await request(app).get('/api/eligibility/answers').set(auth(s.token))).body.data;
    expect(all).toEqual({ [String(opp._id)]: { guidelines: true } });
  });

  it('a "No" rules it out until changed', async () => {
    await put('guidelines', false);
    expect((await check()).body.data.overall).toBe('likely_ineligible');
  });

  it('can be cleared per listing, or all at once', async () => {
    await request(app).delete('/api/eligibility/answers').query({ opportunityId: String(opp._id) }).set(auth(s.token));
    expect((await check()).body.data.overall).toBe('missing_information');
    await put('guidelines', true);
    expect((await request(app).delete('/api/eligibility/answers').set(auth(s.token))).body.data.cleared).toBe(1);
    expect((await check()).body.data.savedAnswers).toEqual({});
    await put('guidelines', true);
    await put('guidelines', null);
    expect((await check()).body.data.savedAnswers).toEqual({});
  });

  it('only criteria the student confirms themselves can be answered, and answers are per student', async () => {
    expect((await put('degree', true)).status).toBe(400);
    await put('guidelines', true);
    const other = await registerStudent(app);
    const theirs = await request(app).post('/api/eligibility/check').set(auth(other.token)).send({ opportunityId: String(opp._id) });
    expect(theirs.body.data.savedAnswers).toEqual({});
  });
});
