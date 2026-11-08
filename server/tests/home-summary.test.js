import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { connectTestDb, disconnectTestDb, registerStudent, auth, createOpportunity, setProfile } from './helpers.js';

let app;
let s;
beforeAll(async () => {
  app = await connectTestDb('home_summary');
  s = await registerStudent(app);
  await setProfile(app, s.token, { degree: 'B.Tech', currentYear: 2 });
  const in20 = new Date(Date.now() + 20 * 86400000);
  // Scholarships whose income rule the student has not answered: "missing_information".
  for (let i = 0; i < 5; i += 1) {
    await createOpportunity({ opportunityType: 'scholarship', deadline: in20, eligibilityRules: [{ key: 'income', kind: 'max_family_income', label: 'Income ≤ ₹2.5 lakh', numberValue: 250000 }] });
  }
  await createOpportunity({ opportunityType: 'scholarship', deadline: new Date(Date.now() + 90 * 86400000), eligibleDegrees: ['B.Tech'] });
  await createOpportunity({ opportunityType: 'scholarship', deadline: new Date(Date.now() - 86400000) }); // closed
  await createOpportunity({ opportunityType: 'scholarship', eligibleDegrees: ['MBBS'] }); // open (closes in 10 days), not eligible
});
afterAll(disconnectTestDb);

describe('H4: Home tiles count what Find lists', () => {
  it('counts every open scholarship, with the eligibility split as secondary numbers', async () => {
    const res = await request(app).get('/api/opportunities/summary').set(auth(s.token));
    expect(res.status).toBe(200);
    expect(res.body.data.types.scholarship).toEqual({ open: 7, likelyEligible: 1, needDetails: 5, likelyIneligible: 1, closingIn30Days: 6 });
  });

  it('agrees with Find for every type', async () => {
    const summary = (await request(app).get('/api/opportunities/summary').set(auth(s.token))).body.data.types;
    for (const [type, counts] of Object.entries(summary)) {
      const find = await request(app).get('/api/opportunities').query({ type, limit: 1 }).set(auth(s.token));
      expect(find.body.meta.total, type).toBe(counts.open);
    }
  });
});
