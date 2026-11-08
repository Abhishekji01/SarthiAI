import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { connectTestDb, disconnectTestDb, registerStudent, auth } from './helpers.js';
import { outbox } from '../src/mail/mailer.js';
import { User } from '../src/models/User.js';
import { canEmail } from '../src/auth/emailVerification.js';

let app;
beforeAll(async () => { app = await connectTestDb('account_safety'); });
afterAll(disconnectTestDb);

const login = (email, password) => request(app).post('/api/auth/login').send({ email, password });

describe('F2: sign-out scope', () => {
  it('Sign out ends only this device; Sign out of all devices ends every one', async () => {
    const s = await registerStudent(app);
    const phone = (await login(s.email, s.password)).body.data.token;
    const laptop = (await login(s.email, s.password)).body.data.token;
    expect((await request(app).post('/api/auth/logout').set(auth(phone))).body.data.scope).toBe('this_device');
    expect((await request(app).get('/api/auth/me').set(auth(phone))).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(auth(laptop))).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(auth(s.token))).status).toBe(200);
    expect((await request(app).post('/api/auth/logout-all').set(auth(laptop))).body.data.scope).toBe('all_devices');
    expect((await request(app).get('/api/auth/me').set(auth(laptop))).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(auth(s.token))).status).toBe(401);
  });
});

describe('F2: login throttling', () => {
  it('slows down after 4 failures, locks at 20, and resets on success', async () => {
    const s = await registerStudent(app);
    for (let i = 0; i < 4; i += 1) expect((await login(s.email, 'wrong-password-x')).status).toBe(401);
    const t0 = Date.now();
    expect((await login(s.email, 'wrong-password-x')).status).toBe(401);
    expect((await login(s.email, s.password)).status).toBe(200); // success resets the email counter
    for (let i = 0; i < 20; i += 1) await login(s.email, 'wrong-password-x');
    const locked = await login(s.email, s.password);
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('TOO_MANY_ATTEMPTS');
    expect(Date.now() - t0).toBeGreaterThanOrEqual(5); // test base delay is 5 ms (production: 1 s, doubling, max 15 s)
  });
});

describe('F2: email verification', () => {
  const lastLink = async (email) => {
    await new Promise((r) => setTimeout(r, 50));
    const m = [...outbox].reverse().find((x) => x.to === email && x.kind === 'verify_email');
    return m ? new URL(m.text.match(/https?:\/\/\S+/)[0]).searchParams.get('token') : null;
  };

  it('sends a link at sign-up; opening it verifies the address once', async () => {
    const s = await registerStudent(app);
    expect(s.user.emailVerified).toBe(false);
    expect(canEmail(await User.findById(s.user.id))).toBe(false);
    const token = await lastLink(s.email);
    expect(token).toBeTruthy();
    const res = await request(app).post('/api/auth/verify-email').send({ token });
    expect(res.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(auth(s.token))).body.data.user.emailVerified).toBe(true);
    expect(canEmail(await User.findById(s.user.id))).toBe(true);
    expect((await request(app).post('/api/auth/verify-email').send({ token })).status).toBe(400);
  });

  it('resend sends a new link; nothing for a verified address', async () => {
    const s = await registerStudent(app);
    const first = await lastLink(s.email);
    expect((await request(app).post('/api/auth/verify-email/resend').set(auth(s.token))).body.data.sent).toBe(true);
    const second = await lastLink(s.email);
    expect(second).not.toBe(first);
    expect((await request(app).post('/api/auth/verify-email').send({ token: first })).status).toBe(400); // replaced
    expect((await request(app).post('/api/auth/verify-email').send({ token: second })).status).toBe(200);
    expect((await request(app).post('/api/auth/verify-email/resend').set(auth(s.token))).body.data.alreadyVerified).toBe(true);
  });
});

describe('F2: Google sign-in is off unless configured', () => {
  it('reports it disabled and refuses to start', async () => {
    expect((await request(app).get('/api/auth/config')).body.data.googleSignIn).toBe(false);
    const start = await request(app).get('/api/auth/google/start');
    expect(start.status).toBe(302);
    expect(start.headers.location).toBe('/welcome?error=google_off');
  });
});
