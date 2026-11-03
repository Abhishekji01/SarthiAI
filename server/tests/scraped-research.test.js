import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import { connectTestDb, disconnectTestDb, registerStudent, auth } from './helpers.js';
import { ingestScrapedRecords } from '../src/ingestion/importer.js';

// Output of ingest/research_programs.py on sample pages (ingest/tests/test_research_programs.py).
const fixture = JSON.parse(await readFile(new URL('./fixtures/research-sample.json', import.meta.url), 'utf8'));
const scholarships = JSON.parse(await readFile(new URL('./fixtures/scholarship-sample.json', import.meta.url), 'utf8'));

let app;
let s;
beforeAll(async () => {
  app = await connectTestDb('scrapedresearch');
  s = await registerStudent(app);
});
afterAll(disconnectTestDb);

describe('scraped research internships', () => {
  it('imports programme pages, quoting the deadline or saying dates are not announced', async () => {
    const r = await ingestScrapedRecords(fixture, { now: new Date('2026-11-03T12:00:00Z') });
    expect(r.rejected).toEqual([]);
    const res = await request(app).get('/api/opportunities?type=research&includeClosed=true').set(auth(s.token));
    const surge = res.body.data.find((o) => o.organization === 'IIT Kanpur');
    expect(surge.availability).toBe('open');
    expect(surge.deadlineNote).toMatch(/15th January 2027/);
    const mitacs = res.body.data.find((o) => o.title.startsWith('Mitacs'));
    expect(mitacs.deadline).toBeNull();
    expect(mitacs.availability).toBe('unknown');
    expect(mitacs.location.country).toBe('Canada');
  });

  it('is found by "research internship" and "summer internship iit" searches', async () => {
    const a = await request(app).get('/api/opportunities?q=research%20internship&includeClosed=true').set(auth(s.token));
    expect(a.body.data.map((o) => o.organization)).toContain('IIT Kanpur');
    expect(a.body.meta.search.relaxed).toBe(false);   // a real match, not the fallback
    const b = await request(app).get('/api/opportunities?q=summer%20iit&includeClosed=true').set(auth(s.token));
    expect(b.body.data[0].organization).toBe('IIT Kanpur');
  });

  it('imports scholarship pages and never auto-recommends a group-restricted one', async () => {
    const r = await ingestScrapedRecords(scholarships, { now: new Date('2026-11-03T12:00:00Z') });
    expect(r.rejected).toEqual([]);
    const res = await request(app).get('/api/matches?tier=all&limit=30').set(auth(s.token));
    const kotak = res.body.data.find((o) => o.title === 'Kotak Kanya Scholarship');
    expect(kotak?.tier).not.toBe('recommended');
    const d = await request(app).get('/api/opportunities?q=kotak&includeClosed=true').set(auth(s.token));
    expect(d.body.data[0].match.audienceRestricted).toBe(true);
    expect(d.body.data[0].match.factors[0].detail).toMatch(/Only for: girl students/);
  });
});
