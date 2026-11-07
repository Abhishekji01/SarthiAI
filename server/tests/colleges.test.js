import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { connectTestDb, disconnectTestDb, registerStudent, auth } from './helpers.js';
import { College, normalizeCollegeName } from '../src/models/College.js';

let app;
beforeAll(async () => {
  app = await connectTestDb('colleges');
  await College.create([
    { name: 'KIET Group of Institutions', normalizedName: normalizeCollegeName('KIET Group of Institutions'), shortName: 'KIET', city: 'Ghaziabad', state: 'Uttar Pradesh', listed: true },
    { name: 'Indian Institute of Technology Delhi', normalizedName: normalizeCollegeName('Indian Institute of Technology Delhi'), shortName: 'IIT Delhi', city: 'New Delhi', state: 'Delhi', listed: true },
  ]);
});
afterAll(disconnectTestDb);

describe('L4: college search', () => {
  it('a blank or whitespace-only query returns the full list', async () => {
    const all = await request(app).get('/api/colleges');
    const spaces = await request(app).get('/api/colleges').query({ q: '   ' });
    expect(all.body.data).toHaveLength(2);
    expect(spaces.body.data.map((c) => c.name)).toEqual(all.body.data.map((c) => c.name));
  });

  it('matches every word across name, short name, city and state', async () => {
    expect((await request(app).get('/api/colleges').query({ q: '  kiet ghaziabad ' })).body.data.map((c) => c.shortName)).toEqual(['KIET']);
    expect((await request(app).get('/api/colleges').query({ q: 'iit delhi' })).body.data.map((c) => c.shortName)).toEqual(['IIT Delhi']);
    expect((await request(app).get('/api/colleges').query({ q: 'kiet delhi' })).body.data).toEqual([]);
  });

  it('"My institution isn\'t listed" saves the typed (trimmed) name', async () => {
    const s = await registerStudent(app);
    const res = await request(app).patch('/api/profile').set(auth(s.token)).send({ profile: { customCollegeName: '  Government Engineering College, Ajmer  ' } });
    expect(res.status).toBe(200);
    expect(res.body.data.user.profile.collegeName).toBe('Government Engineering College, Ajmer');
    expect(await College.findOne({ normalizedName: normalizeCollegeName('Government Engineering College, Ajmer') }).lean()).toMatchObject({ listed: false });
    // Unlisted colleges never appear in the public search until reviewed.
    expect((await request(app).get('/api/colleges').query({ q: 'Ajmer' })).body.data).toEqual([]);
  });
});
