import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import { connectTestDb, disconnectTestDb, registerStudent, auth, setProfile } from './helpers.js';
import { ingestScrapedRecords } from '../src/ingestion/importer.js';

// Output of ingest/hackathons.py on sample Devfolio/Devpost/HackerEarth/Codeforces payloads (ingest/tests/test_hackathons.py).
const fixture = JSON.parse(await readFile(new URL('./fixtures/hack-sample.json', import.meta.url), 'utf8'));
const NOW = new Date('2026-11-03T12:00:00Z');

let app;
let s;
beforeAll(async () => {
  app = await connectTestDb('scrapedhacks');
  s = await registerStudent(app);
  await setProfile(app, s.token, { degree: 'B.Tech', currentYear: 2, skills: ['Python', 'Machine Learning'], interests: ['Hackathons', 'AI/ML'] });
});
afterAll(disconnectTestDb);

describe('scraped hackathons and contests', () => {
  it('imports every adapter record without validation errors', async () => {
    const r = await ingestScrapedRecords(fixture, { now: NOW });
    expect(r.rejected).toEqual([]);
    expect(r.inserted).toBe(fixture.length);
  });

  it('lists hackathons and coding contests in Discover with their deadlines', async () => {
    const hacks = await request(app).get('/api/opportunities?type=hackathon&includeClosed=true').set(auth(s.token));
    const titles = hacks.body.data.map((o) => o.title);
    expect(titles).toEqual(expect.arrayContaining(['HackIndia Delhi', 'Global AI Hackathon']));
    const delhi = hacks.body.data.find((o) => o.title === 'HackIndia Delhi');
    expect(delhi.deadline).toBe('2026-12-05T18:29:00.000Z');
    expect(delhi.location.city).toBe('New Delhi');
    const contests = await request(app).get('/api/opportunities?type=competition&includeClosed=true').set(auth(s.token));
    expect(contests.body.data.map((o) => o.title)).toEqual(expect.arrayContaining(['Codeforces Round 1000 (Div. 2)', 'Fresher Hiring Challenge']));
  });

  it('search understands "hackathon" and matches the interest', async () => {
    const res = await request(app).get('/api/opportunities?q=ai%20hackathon&includeClosed=true').set(auth(s.token));
    expect(res.body.data[0].title).toBe('Global AI Hackathon');
    expect(res.body.data[0].match.factors.some((f) => f.factor === 'interests')).toBe(true);
  });
});
