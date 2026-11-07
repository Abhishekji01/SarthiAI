import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { connectTestDb, disconnectTestDb, createOpportunity, createCollege } from './helpers.js';
import { opportunityMeta, withMeta } from '../src/web/seo.js';

let app;
let pub;
let campusOnly;
let draft;
beforeAll(async () => {
  app = await connectTestDb('public_pages');
  pub = await createOpportunity({ title: 'Open Research Fellowship', summary: 'Eight weeks in a lab <b>with</b> a stipend.', verificationNotes: 'internal note' });
  const college = await createCollege('Test College');
  campusOnly = await createOpportunity({ title: 'Campus-only Drive', collegeId: college._id });
  draft = await createOpportunity({ title: 'Unpublished', status: 'draft' });
});
afterAll(disconnectTestDb);

describe('F1: public opportunity pages', () => {
  it('serves the official facts without signing in, and nothing personal', async () => {
    const res = await request(app).get(`/api/public/opportunities/${pub._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ title: 'Open Research Fellowship', sourceUrl: pub.sourceUrl });
    for (const k of ['match', 'isSaved', 'tracked', 'verificationNotes', 'collegeId']) expect(res.body.data).not.toHaveProperty(k);
  });

  it('never exposes college-only or unpublished listings', async () => {
    expect((await request(app).get(`/api/public/opportunities/${campusOnly._id}`)).status).toBe(404);
    expect((await request(app).get(`/api/public/opportunities/${draft._id}`)).status).toBe(404);
    expect((await request(app).get('/api/public/opportunities/not-an-id')).status).toBe(400);
  });

  it('builds escaped Open Graph / Twitter tags and a canonical URL', () => {
    const meta = opportunityMeta({ ...pub.toObject(), title: 'A "quoted" <title>' });
    expect(meta.url).toMatch(new RegExp(`/opportunity/${pub._id}$`));
    const html = withMeta('<html><head><title>SarthiAI</title><meta name="description" content="x" /></head><body></body></html>', meta);
    expect(html).toContain('<meta property="og:title" content="A &quot;quoted&quot; &lt;title&gt; · SarthiAI" />');
    expect(html).toContain(`<link rel="canonical" href="${meta.url}" />`);
    expect(html).toContain('twitter:card');
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/name="description"/g)).toHaveLength(1);
  });
});
