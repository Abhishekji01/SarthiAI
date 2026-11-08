import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { connectTestDb, disconnectTestDb, registerStudent, auth, createOpportunity } from './helpers.js';
import { checklistFor } from '../src/documents/kinds.js';
import { env } from '../src/config/env.js';

let app;
let s;
beforeAll(async () => { app = await connectTestDb('documents'); s = await registerStudent(app); });
afterAll(disconnectTestDb);

const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2000, 0x20), Buffer.from('\n%%EOF')]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(500)]);
const upload = (buf, kind, name, token = s.token) => request(app).post('/api/documents').query({ kind, name }).set(auth(token)).set('Content-Type', 'application/octet-stream').send(buf);

describe('F7: document checklist', () => {
  it("uses the listing's own list first, then what its criteria usually need", () => {
    const list = checklistFor({
      requiredDocuments: ['Valid income certificate issued by the State/UT Government', 'Contact details of one present teacher'],
      eligibilityRules: [{ kind: 'max_family_income', label: 'Income ≤ ₹2.5 lakh' }, { kind: 'home_state_in', label: 'Domicile: Kerala' }],
    }, { have: ['income_certificate'] });
    expect(list.map((i) => [i.kind, i.source, i.have])).toEqual([
      ['income_certificate', 'listing', true], ['recommendation', 'listing', false], ['domicile_certificate', 'criterion', false],
    ]);
    expect(list[2].because).toBe('Domicile: Kerala');
  });

  it('API: checklist per listing reflects what the student has', async () => {
    const o = await createOpportunity({ requiredDocuments: ['Mark sheets from Class X till the last examination'] });
    await request(app).put('/api/documents/have').set(auth(s.token)).send({ kind: 'marksheets', have: true });
    const r = await request(app).get(`/api/opportunities/${o._id}/documents`).set(auth(s.token));
    expect(r.body.data).toEqual([expect.objectContaining({ kind: 'marksheets', have: true, source: 'listing' })]);
  });
});

describe('F7: private document vault (GridFS)', () => {
  let docId;
  it('uploads a PDF (type checked from its bytes) and marks the document as had', async () => {
    const r = await upload(PDF, 'income_certificate', 'Income cert 2026.pdf');
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ kind: 'income_certificate', contentType: 'application/pdf', fileName: 'Income cert 2026.pdf' });
    docId = r.body.data.id;
    const list = (await request(app).get('/api/documents').set(auth(s.token))).body.data;
    expect(list.documents).toHaveLength(1);
    expect(list.have).toContain('income_certificate');
    expect(list.usage).toMatchObject({ files: 1, maxFiles: 15 });
  });

  it('downloads only through a short-lived signed link', async () => {
    const link = (await request(app).post(`/api/documents/${docId}/link`).set(auth(s.token))).body.data;
    const file = await request(app).get(link.url).buffer(true).parse((res, cb) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); });
    expect(file.status).toBe(200);
    expect(file.headers['content-disposition']).toMatch(/attachment/);
    expect(file.headers['cache-control']).toContain('no-store');
    expect(Buffer.compare(file.body, PDF)).toBe(0);
    expect((await request(app).get(`/api/documents/file/${docId}`)).status).toBe(401);
    const expired = jwt.sign({ purpose: 'document', doc: docId }, env.JWT_SECRET, { subject: s.user.id, expiresIn: -10 });
    expect((await request(app).get(`/api/documents/file/${docId}?token=${expired}`)).status).toBe(401);
  });

  it("other students can't list, link or delete it", async () => {
    const other = await registerStudent(app);
    expect((await request(app).get('/api/documents').set(auth(other.token))).body.data.documents).toEqual([]);
    expect((await request(app).post(`/api/documents/${docId}/link`).set(auth(other.token))).status).toBe(404);
    expect((await request(app).delete(`/api/documents/${docId}`).set(auth(other.token))).status).toBe(404);
    const forged = jwt.sign({ purpose: 'document', doc: docId }, env.JWT_SECRET, { subject: other.user.id, expiresIn: 60 });
    expect((await request(app).get(`/api/documents/file/${docId}?token=${forged}`)).status).toBe(404);
  });

  it('rejects other file types, Aadhaar/bank uploads, oversize files and a full vault', async () => {
    expect((await upload(Buffer.from('<html><script>alert(1)</script>'), 'marksheets', 'x.pdf')).status).toBe(400);
    expect((await upload(PDF, 'aadhaar', 'aadhaar.pdf')).status).toBe(400);
    expect((await upload(PDF, 'bank_details', 'bank.pdf')).status).toBe(400);
    expect((await upload(Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]), 'marksheets', 'big.pdf')).status).toBe(413);
    const t = await registerStudent(app);
    for (let i = 0; i < 15; i += 1) expect((await upload(PNG, 'other', `p${i}.png`, t.token)).status).toBe(201);
    expect((await upload(PNG, 'other', 'one-more.png', t.token)).body.error.message).toMatch(/can hold 15 files/);
  });

  it('deletes the file and its record', async () => {
    expect((await request(app).delete(`/api/documents/${docId}`).set(auth(s.token))).status).toBe(200);
    expect((await request(app).get('/api/documents').set(auth(s.token))).body.data.documents).toEqual([]);
  });
});
