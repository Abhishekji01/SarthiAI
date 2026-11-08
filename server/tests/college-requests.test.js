import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { connectTestDb, disconnectTestDb, registerStudent, auth, makeAdmin, createCollege } from './helpers.js';
import { College } from '../src/models/College.js';
import { importCollegesFromCsv, parseCsv } from '../src/ingestion/collegeCsv.js';

let app;
let admin;
beforeAll(async () => { app = await connectTestDb('college_requests'); admin = await makeAdmin(app, { platform: true }); });
afterAll(disconnectTestDb);

const notListed = (s, name, extra = {}) => request(app).patch('/api/profile').set(auth(s.token)).send({ profile: { customCollegeName: name, ...extra } });
const pending = async () => (await request(app).get('/api/admin/college-requests').set(auth(admin.token))).body.data;
const review = (id, body) => request(app).post(`/api/admin/college-requests/${id}`).set(auth(admin.token)).send(body);
const me = async (s) => (await request(app).get('/api/auth/me').set(auth(s.token))).body.data.user.profile;

describe('F10: "Add my college" requests', () => {
  it('a typed institution creates one request; more students join it', async () => {
    const a = await registerStudent(app);
    const b = await registerStudent(app);
    await notListed(a, 'Govt Engineering College Ajmer', { customCollegeCity: 'Ajmer', customCollegeState: 'Rajasthan' });
    await notListed(b, 'Govt  Engineering College, Ajmer');
    const reqs = await pending();
    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toMatchObject({ name: 'Govt Engineering College Ajmer', city: 'Ajmer', state: 'Rajasthan', students: 2, status: 'pending' });
    expect((await me(b)).collegeName).toBe('Govt Engineering College Ajmer');
    // Not searchable until approved.
    expect((await request(app).get('/api/colleges').query({ q: 'Ajmer' })).body.data).toEqual([]);
  });

  it('approve: the college becomes listed and searchable; students stay linked', async () => {
    const [r] = await pending();
    const res = await review(r.id, { action: 'approve', name: 'Government Engineering College, Ajmer', shortName: 'GECA' });
    expect(res.body.data.status).toBe('approved');
    const found = (await request(app).get('/api/colleges').query({ q: 'Ajmer' })).body.data;
    expect(found.map((c) => c.shortName)).toEqual(['GECA']);
    expect(found[0].city).toBe('Ajmer');
    expect((await review(r.id, { action: 'reject' })).status).toBe(400); // already reviewed
  });

  it('merge: students move to the existing college and the duplicate goes away', async () => {
    const kiet = await createCollege('KIET Group of Institutions');
    const s = await registerStudent(app);
    await notListed(s, 'KIET Ghaziabad');
    const r = (await pending()).find((x) => x.name === 'KIET Ghaziabad');
    expect((await review(r.id, { action: 'merge', intoCollegeId: String(kiet._id) })).body.data.status).toBe('merged');
    expect(await me(s)).toMatchObject({ collegeId: String(kiet._id), collegeName: 'KIET Group of Institutions' });
    expect(await College.findById(r.collegeId)).toBeNull();
  });

  it('reject: the student keeps their typed name; it stays out of search', async () => {
    const s = await registerStudent(app);
    await notListed(s, 'Not A Real Place 123');
    const r = (await pending()).find((x) => x.name === 'Not A Real Place 123');
    expect((await review(r.id, { action: 'reject' })).body.data.status).toBe('rejected');
    expect((await me(s)).collegeName).toBe('Not A Real Place 123');
    expect((await request(app).get('/api/colleges').query({ q: 'Real Place' })).body.data).toEqual([]);
  });

  it('only platform admins can see or review requests', async () => {
    const s = await registerStudent(app);
    expect((await request(app).get('/api/admin/college-requests').set(auth(s.token))).status).toBe(403);
    const collegeAdmin = await makeAdmin(app, { collegeIds: [] });
    expect((await request(app).get('/api/admin/college-requests').set(auth(collegeAdmin.token))).status).toBe(403);
  });
});

describe('F10: importer for an official list (not run automatically)', () => {
  const CSV = 'AISHE Code,Name,State,District,Website\r\nC-1001,"Rajkiya Engineering College, Kannauj",Uttar Pradesh,Kannauj,https://reck.ac.in\r\nC-1002,Indian Institute of Technology Delhi,Delhi,New Delhi,\r\nC-1003,"Rajkiya Engineering College, Kannauj",UP,Kannauj,\r\nC-1004,,Kerala,Kochi,\r\nC-1005,"Model ""Engineering"" College",Kerala,Ernakulam,not-a-url\r\n';

  it('parses quoted CSV fields', () => {
    expect(parseCsv(CSV)[5]).toEqual(['C-1005', 'Model "Engineering" College', 'Kerala', 'Ernakulam', 'not-a-url']);
  });

  it('dry run reports without writing; apply inserts only new colleges', async () => {
    await createCollege('Indian Institute of Technology Delhi');
    const before = await College.countDocuments();
    const dry = await importCollegesFromCsv(CSV);
    expect(dry).toMatchObject({ rows: 5, valid: 3, new: 2, existing: 1, inserted: 0 });
    expect(dry.skipped.map((x) => x.reason)).toEqual(['duplicate in file', 'no name']);
    expect(await College.countDocuments()).toBe(before);
    const applied = await importCollegesFromCsv(CSV, { apply: true });
    expect(applied.inserted).toBe(2);
    const reck = await College.findOne({ name: 'Rajkiya Engineering College, Kannauj' }).lean();
    expect(reck).toMatchObject({ city: 'Kannauj', state: 'Uttar Pradesh', website: 'https://reck.ac.in', listed: true });
    expect((await College.findOne({ name: 'Model "Engineering" College' }).lean()).website).toBeUndefined();
    expect((await importCollegesFromCsv(CSV, { apply: true })).inserted).toBe(0); // idempotent
  });
});
