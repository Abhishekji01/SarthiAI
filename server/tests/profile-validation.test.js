import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { connectTestDb, disconnectTestDb, registerStudent, auth } from './helpers.js';
import { graduationYearRange } from '../../shared/profileRules.js';

let app;
let s;
beforeAll(async () => { app = await connectTestDb('profile_validation'); s = await registerStudent(app); });
afterAll(disconnectTestDb);

const patch = (profile) => request(app).patch('/api/profile').set(auth(s.token)).send({ profile });
const fields = (res) => res.body.error?.details?.map((d) => d.field) ?? [];

describe('H3: profile limits shared with the forms', () => {
  it('rejects CGPA above 10 or with more than 2 decimals, naming the field', async () => {
    for (const cgpa of [15, 10.5, -1, 8.255]) {
      const res = await patch({ cgpa });
      expect(res.status).toBe(400);
      expect(fields(res)).toEqual(['profile.cgpa']);
    }
    expect((await patch({ cgpa: 8.25 })).status).toBe(200);
  });

  it('rejects negative or fractional income', async () => {
    expect(fields(await patch({ annualFamilyIncomeINR: -1 }))).toEqual(['profile.annualFamilyIncomeINR']);
    expect(fields(await patch({ annualFamilyIncomeINR: 1.5 }))).toEqual(['profile.annualFamilyIncomeINR']);
    expect((await patch({ annualFamilyIncomeINR: 350000 })).status).toBe(200);
  });

  it('limits skills and interests to 30 items of at most 40 characters', async () => {
    expect(fields(await patch({ skills: Array.from({ length: 31 }, (_, i) => `skill${i}`) }))).toEqual(['profile.skills']);
    expect(fields(await patch({ interests: ['x'.repeat(41)] }))).toEqual(['profile.interests']);
    expect((await patch({ skills: Array.from({ length: 30 }, (_, i) => `skill${i}`), interests: ['y'.repeat(40)] })).status).toBe(200);
  });

  it('rejects a graduation year that does not fit the year of study', async () => {
    const { max } = graduationYearRange('B.Tech', 4);
    const res = await patch({ degree: 'B.Tech', currentYear: 4, graduationYear: max + 5 });
    expect(res.status).toBe(400);
    expect(fields(res)).toEqual(['profile.graduationYear']);
    expect(res.body.error.details[0].message).toMatch(/year-4 student graduates/);
    expect((await patch({ degree: 'B.Tech', currentYear: 4, graduationYear: max })).status).toBe(200);
  });
});

describe('L3: one list of states and union territories', async () => {
  const { HOME_STATE_OPTIONS, UNION_TERRITORIES } = await import('../../shared/states.js');
  const { checkEligibility } = await import('../src/eligibility/engine.js');

  it('includes all 8 union territories, including the four that were missing', () => {
    expect(UNION_TERRITORIES).toHaveLength(8);
    for (const ut of ['Chandigarh', 'Andaman and Nicobar Islands', 'Lakshadweep', 'Dadra and Nagar Haveli and Daman and Diu']) expect(HOME_STATE_OPTIONS).toContain(ut);
    expect(HOME_STATE_OPTIONS).toHaveLength(28 + 8 + 1);
  });

  it('the API accepts every option and rejects anything else', async () => {
    for (const homeState of HOME_STATE_OPTIONS) expect((await patch({ homeState })).status, homeState).toBe(200);
    expect(fields(await patch({ homeState: 'Atlantis' }))).toEqual(['profile.homeState']);
    expect((await patch({ homeState: null })).status).toBe(200);
  });

  it('domicile rules match union territories by name or common short form', () => {
    const opp = { verificationStatus: 'verified', eligibilityRules: [{ key: 'dom', kind: 'home_state_in', label: 'Domicile: Chandigarh, DNH & DD', values: ['Chandigarh', 'Dadra and Nagar Haveli', 'Daman and Diu'] }] };
    expect(checkEligibility(opp, { homeState: 'Chandigarh' }).criteria[0].status).toBe('met');
    expect(checkEligibility(opp, { homeState: 'Dadra and Nagar Haveli and Daman and Diu' }).criteria[0].status).toBe('met');
    expect(checkEligibility(opp, { homeState: 'Lakshadweep' }).criteria[0].status).toBe('unmet');
  });
});
