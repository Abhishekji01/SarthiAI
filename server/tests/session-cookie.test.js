import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { connectTestDb, disconnectTestDb, registerStudent, auth } from './helpers.js';

let app;
beforeAll(async () => { app = await connectTestDb('session_cookie'); });
afterAll(disconnectTestDb);

const WEB = { 'X-Sarthi-Client': 'web' };
const cookieFrom = (res) => (res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sarthi_session='));

describe('L11: web sessions in an httpOnly cookie', () => {
  it('the web app gets an httpOnly, SameSite=Lax cookie and no token in the body', async () => {
    const res = await request(app).post('/api/auth/register').set(WEB).send({ name: 'Web User', email: 'web@example.test', password: 'a-long-passphrase' });
    expect(res.status).toBe(201);
    expect(res.body.data.token).toBeNull();
    expect(res.body.data.session).toBe('cookie');
    const c = cookieFrom(res);
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=Lax/i);
    expect(c).toMatch(/Path=\/api/);
  });

  it('reads with the cookie; writes need the app header and a same-site Origin (CSRF)', async () => {
    const login = await request(app).post('/api/auth/login').set(WEB).send({ email: 'web@example.test', password: 'a-long-passphrase' });
    const cookie = cookieFrom(login).split(';')[0];
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(200);
    const patch = (headers) => request(app).patch('/api/profile').set({ Cookie: cookie, ...headers }).send({ profile: { headline: 'hi' } });
    expect((await patch({})).status).toBe(403);
    expect((await patch({ ...WEB, Origin: 'https://evil.example' })).status).toBe(403);
    const ok = await patch({ ...WEB, Origin: 'http://127.0.0.1', Host: '127.0.0.1' });
    expect(ok.status).toBe(200);
    expect((await patch(WEB)).status).toBe(200); // same-origin fetches may omit Origin
  });

  it('Android / API clients keep using bearer tokens', async () => {
    const s = await registerStudent(app);
    expect(s.token).toBeTruthy();
    expect((await request(app).patch('/api/profile').set(auth(s.token)).send({ profile: { headline: 'x' } })).status).toBe(200);
  });

  it('a token stored by an older web version is moved into the cookie', async () => {
    const s = await registerStudent(app);
    const res = await request(app).post('/api/auth/session').set({ ...auth(s.token), ...WEB });
    expect(res.status).toBe(200);
    const cookie = cookieFrom(res).split(';')[0];
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).body.data.user.email).toBe(s.email);
  });

  it('sign out clears the cookie and ends the session', async () => {
    const login = await request(app).post('/api/auth/login').set(WEB).send({ email: 'web@example.test', password: 'a-long-passphrase' });
    const cookie = cookieFrom(login).split(';')[0];
    const out = await request(app).post('/api/auth/logout').set({ Cookie: cookie, ...WEB });
    expect(out.status).toBe(200);
    expect(cookieFrom(out)).toMatch(/sarthi_session=;|Expires=Thu, 01 Jan 1970/);
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });
});
