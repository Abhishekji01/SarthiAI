import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import { connectTestDb, disconnectTestDb, registerStudent, auth, setProfile } from './helpers.js';
import { ingestScrapedRecords } from '../src/ingestion/importer.js';

// Output of ingest/ats_jobs.py on sample Greenhouse/Lever/Ashby payloads (ingest/tests/test_ats_jobs.py).
const fixture = JSON.parse(await readFile(new URL('./fixtures/ats-sample.json', import.meta.url), 'utf8'));

let app;
let s;
beforeAll(async () => {
  app = await connectTestDb('scrapedjobs');
  s = await registerStudent(app);
  await setProfile(app, s.token, { degree: 'B.Tech', branch: 'CSE', graduationYear: 2027, currentYear: 3, skills: ['Python', 'DSA'], interests: ['Internships'] });
});
afterAll(disconnectTestDb);

describe('scraped internships and jobs', () => {
  it('imports every adapter record without validation errors', async () => {
    const r = await ingestScrapedRecords(fixture);
    expect(r.rejected).toEqual([]);
    expect(r.inserted).toBe(fixture.length);
  });

  it('shows them in Discover by type and checks the graduation-year rule', async () => {
    const res = await request(app).get('/api/opportunities?type=internship').set(auth(s.token));
    const intern = res.body.data.find((o) => o.title === 'Software Engineer Intern (Summer 2027)');
    expect(intern.sourceType).toBe('employer_career_page');
    expect(intern.match.factors.some((f) => /Graduating in 2027 is eligible/.test(f.detail))).toBe(true);
    // The posting's own requirements always need the student's confirmation.
    expect(intern.match.eligibilityOverall).toBe('missing_information');
    const jobs = await request(app).get('/api/opportunities?q=fresher').set(auth(s.token));
    expect(jobs.body.data.length).toBeGreaterThan(0);
  });

  it('recommends the confirmed-fit internship', async () => {
    const res = await request(app).get('/api/matches?tier=all').set(auth(s.token));
    const rec = res.body.data.find((o) => o.title === 'Software Engineer Intern (Summer 2027)');
    expect(rec.tier).toBe('recommended');
  });
});
