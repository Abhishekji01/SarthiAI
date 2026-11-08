import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { connectTestDb, disconnectTestDb, registerStudent, auth, createOpportunity, setProfile } from './helpers.js';
import { outbox } from '../src/mail/mailer.js';
import { runSavedSearchAlerts } from '../src/notify/jobs.js';
import { SavedSearch } from '../src/models/SavedSearch.js';
import { User } from '../src/models/User.js';

let app;
let s;
beforeAll(async () => {
  app = await connectTestDb('find_filters');
  s = await registerStudent(app);
  await setProfile(app, s.token, { degree: 'B.Tech', currentYear: 2 });
  await createOpportunity({ title: 'Big Stipend Internship', opportunityType: 'internship', stipend: { amount: 40000, currency: 'INR', period: 'per_month' }, deadline: new Date(Date.now() + 20 * 86400000) });
  await createOpportunity({ title: 'Small Stipend Internship', opportunityType: 'internship', stipend: { amount: 5000, currency: 'INR', period: 'per_month' }, deadline: new Date(Date.now() + 3 * 86400000) });
  await createOpportunity({ title: 'Unpaid Internship', opportunityType: 'internship', deadline: new Date(Date.now() + 9 * 86400000) });
  await createOpportunity({ title: 'MBBS Only Internship', opportunityType: 'internship', eligibleDegrees: ['MBBS'], stipend: { amount: 60000, currency: 'INR', period: 'per_month' } });
  await createOpportunity({ title: 'Big Award Scholarship', opportunityType: 'scholarship', award: { amount: 200000, currency: 'INR', period: 'per_year' } });
});
afterAll(disconnectTestDb);

const find = (query) => request(app).get('/api/opportunities').query(query).set(auth(s.token)).then((r) => r.body);
const titles = (body) => body.data.map((o) => o.title);

describe('F6: Find filters', () => {
  it('sorts by deadline, soonest first', async () => {
    expect(titles(await find({ type: 'internship', sort: 'deadline' })).slice(0, 2)).toEqual(['Small Stipend Internship', 'Unpaid Internship']);
  });
  it('filters by stipend or award (monthly stipends count x12)', async () => {
    expect(titles(await find({ type: 'internship', minAnnualAmount: 120000 })).sort()).toEqual(['Big Stipend Internship', 'MBBS Only Internship']);
    expect(titles(await find({ minAnnualAmount: 150000 })).sort()).toEqual(['Big Award Scholarship', 'Big Stipend Internship', 'MBBS Only Internship']);
  });
  it('hides listings the student is likely not eligible for, and says how many', async () => {
    const body = await find({ type: 'internship', hideIneligible: 'true' });
    expect(titles(body)).not.toContain('MBBS Only Internship');
    expect(body.meta.excludedLikelyIneligible).toBe(1);
  });
});

describe('F6: saved searches with alerts', () => {
  it('saves Find parameters, counts results, renames, toggles alerts and deletes', async () => {
    const created = await request(app).post('/api/searches').set(auth(s.token)).send({ name: 'Paid internships', params: { type: 'internship', minAmount: '120000', hideIneligible: 'true' } });
    expect(created.status).toBe(201);
    expect(created.body.data.query).toBe('type=internship&minAmount=120000&hideIneligible=true');
    const id = created.body.data.id;
    expect((await request(app).get(`/api/searches/${id}/count`).set(auth(s.token))).body.data.total).toBe(1);
    expect((await request(app).patch(`/api/searches/${id}`).set(auth(s.token)).send({ alerts: true, name: 'Paid' })).body.data).toMatchObject({ alerts: true, name: 'Paid' });
    expect((await request(app).get('/api/searches').set(auth(s.token))).body.data).toHaveLength(1);
    const other = await registerStudent(app);
    expect((await request(app).get('/api/searches').set(auth(other.token))).body.data).toHaveLength(0);
    expect((await request(app).delete(`/api/searches/${id}`).set(auth(s.token))).status).toBe(200);
    expect((await request(app).get('/api/searches').set(auth(s.token))).body.data).toHaveLength(0);
  });

  it('rejects empty or unknown parameters', async () => {
    expect((await request(app).post('/api/searches').set(auth(s.token)).send({ name: 'x', params: {} })).status).toBe(400);
    expect((await request(app).post('/api/searches').set(auth(s.token)).send({ name: 'x', params: { role: 'admin' } })).status).toBe(400);
  });

  it('emails new matches once a day when alerts are on (verified email only)', async () => {
    await User.updateOne({ _id: s.user.id }, { $set: { emailVerifiedAt: new Date() } });
    const created = await request(app).post('/api/searches').set(auth(s.token)).send({ name: 'Hackathons', params: { type: 'hackathon' }, alerts: true });
    await SavedSearch.updateOne({ _id: created.body.data.id }, { $set: { lastCheckedAt: new Date(Date.now() - 2 * 86400000) } });
    await createOpportunity({ title: 'Brand New Hackathon', opportunityType: 'hackathon' });
    expect((await runSavedSearchAlerts()).searchAlerts).toBe(1);
    expect((await runSavedSearchAlerts()).searchAlerts).toBe(0); // checked less than a day ago
    const mail = outbox.filter((m) => m.to === s.email && m.kind === 'search_alert');
    expect(mail).toHaveLength(1);
    expect(mail[0].subject).toBe('1 new for “Hackathons”');
    expect(mail[0].text).toContain('Brand New Hackathon');
    expect(mail[0].text).toContain('/discover?type=hackathon');
  });
});
