import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { connectTestDb, disconnectTestDb, registerStudent, auth, setProfile } from './helpers.js';
import { makePdf, SAMPLE_RESUME } from './fixtures/makePdf.js';
import { pdfText, suggestionsFromText } from '../src/profile/resume.js';

let app;
let s;
beforeAll(async () => { app = await connectTestDb('resume'); s = await registerStudent(app); await setProfile(app, s.token, { skills: ['Python'] }); });
afterAll(disconnectTestDb);

const send = (buf) => request(app).post('/api/profile/resume').set(auth(s.token)).set('Content-Type', 'application/pdf').send(buf);

describe('F8: resume → profile suggestions (no AI, nothing saved)', () => {
  it('extracts text from a PDF', async () => {
    const text = await pdfText(makePdf(SAMPLE_RESUME));
    expect(text).toContain('Campus Lost & Found');
    expect(text).toContain('Software Engineering Intern at Acme Analytics');
  });

  it('suggests new skills, projects and experience', async () => {
    const r = await send(makePdf(SAMPLE_RESUME));
    expect(r.status).toBe(200);
    const { skills, projects, experience } = r.body.data.suggestions;
    expect(skills).toEqual(expect.arrayContaining(['Java', 'C++', 'SQL', 'React', 'Node.js', 'Django', 'Deep learning']));
    expect(skills).not.toContain('Python'); // already in the profile
    expect(projects.map((p) => p.title)).toEqual(['Campus Lost & Found', 'Crop Disease Detector']);
    expect(projects[0].skills).toEqual(expect.arrayContaining(['React', 'Node.js']));
    expect(projects[1].description).toMatch(/CNN on 5,000 leaf images/);
    expect(experience).toEqual([
      expect.objectContaining({ role: 'Software Engineering Intern', organization: 'Acme Analytics' }),
      expect.objectContaining({ role: 'Web Developer', organization: 'College Tech Club' }),
    ]);
    // Nothing was saved.
    expect((await request(app).get('/api/profile').set(auth(s.token))).body.data.user.profile.skills).toEqual(['Python']);
  });

  it('does not treat a stray "C" or "R" in prose as a skill', () => {
    const { skills } = suggestionsFromText('Projects\nGrade A in maths, r and c are letters here\n- worked on data', {});
    expect(skills).not.toContain('C');
    expect(skills).not.toContain('R');
  });

  it('refuses non-PDFs, image-only PDFs and oversized files', async () => {
    expect((await send(Buffer.from('<html>not a pdf</html>'))).status).toBe(400);
    expect((await send(makePdf([' ']))).body.error.message).toMatch(/No text found/);
    expect((await send(Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(3 * 1024 * 1024)]))).status).toBe(413);
  });
});
