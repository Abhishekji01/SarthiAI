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
