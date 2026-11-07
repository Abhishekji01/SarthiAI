import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { connectTestDb, disconnectTestDb, registerStudent, auth } from './helpers.js';
import { outbox } from '../src/mail/mailer.js';
import { User } from '../src/models/User.js';
import { hashResetToken } from '../src/auth/passwordReset.js';

let app;
beforeAll(async () => { app = await connectTestDb('password_reset'); });
afterAll(disconnectTestDb);

const lastLinkFor = async (email) => {
  await new Promise((r) => setTimeout(r, 50)); // the email is sent in the background
  const msg = [...outbox].reverse().find((m) => m.to === email && m.kind === 'password_reset');
  return msg ? new URL(msg.text.match(/https?:\/\/\S+/)[0]).searchParams.get('token') : null;
};

describe('H2: forgot password', () => {
  it('answers identically whether or not the account exists', async () => {
    const s = await registerStudent(app);
    const known = await request(app).post('/api/auth/forgot-password').send({ email: s.email });
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody-here@example.test' });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect(await lastLinkFor(s.email)).toBeTruthy();
    expect(outbox.some((m) => m.to === 'nobody-here@example.test')).toBe(false);
  });

  it('stores only a hash of the token, with a 30-minute expiry', async () => {
    const s = await registerStudent(app);
    await request(app).post('/api/auth/forgot-password').send({ email: s.email });
    const token = await lastLinkFor(s.email);
    const u = await User.findOne({ email: s.email }).select('+passwordReset').lean();
    expect(u.passwordReset.tokenHash).toBe(hashResetToken(token));
    expect(u.passwordReset.tokenHash).not.toContain(token);
    const minutes = (new Date(u.passwordReset.expiresAt) - Date.now()) / 60000;
    expect(minutes).toBeGreaterThan(29);
    expect(minutes).toBeLessThanOrEqual(30);
  });

  it('resets the password once, ends every existing session, and signs in', async () => {
    const s = await registerStudent(app);
    await request(app).post('/api/auth/forgot-password').send({ email: s.email });
    const token = await lastLinkFor(s.email);
    const res = await request(app).post('/api/auth/reset-password').send({ token, password: 'a-brand-new-passphrase' });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
    // Old session ended, new one works.
    expect((await request(app).get('/api/auth/me').set(auth(s.token))).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(auth(res.body.data.token))).status).toBe(200);
    // Old password no longer works; the new one does.
    expect((await request(app).post('/api/auth/login').send({ email: s.email, password: s.password })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: s.email, password: 'a-brand-new-passphrase' })).status).toBe(200);
    // Single use.
    const again = await request(app).post('/api/auth/reset-password').send({ token, password: 'another-new-passphrase' });
    expect(again.status).toBe(400);
    expect(again.body.error.message).toMatch(/invalid or has expired/);
  });

  it('rejects expired tokens', async () => {
    const s = await registerStudent(app);
    await request(app).post('/api/auth/forgot-password').send({ email: s.email });
    const token = await lastLinkFor(s.email);
    await User.updateOne({ email: s.email }, { $set: { 'passwordReset.expiresAt': new Date(Date.now() - 1000) } });
    expect((await request(app).post('/api/auth/reset-password').send({ token, password: 'a-brand-new-passphrase' })).status).toBe(400);
  });

  it('applies the password rules to the new password', async () => {
    const s = await registerStudent(app);
    await request(app).post('/api/auth/forgot-password').send({ email: s.email });
    const token = await lastLinkFor(s.email);
    for (const password of ['short', '          ', 'password123']) {
      const res = await request(app).post('/api/auth/reset-password').send({ token, password });
      expect(res.status).toBe(400);
      expect(res.body.error.details[0].field).toBe('password');
    }
  });

  it('rate-limits requests per email and per IP', async () => {
    process.env.RATE_LIMITS_IN_TESTS = 'true';
    try {
      const email = 'flood-target@example.test';
      const codes = [];
      for (let i = 0; i < 4; i += 1) codes.push((await request(app).post('/api/auth/forgot-password').send({ email })).status);
      expect(codes).toEqual([200, 200, 200, 429]);
      const ipCodes = [];
      for (let i = 0; i < 8; i += 1) ipCodes.push((await request(app).post('/api/auth/forgot-password').send({ email: `other${i}@example.test` })).status);
      expect(ipCodes.at(-1)).toBe(429);
      const resetCodes = [];
      for (let i = 0; i < 11; i += 1) resetCodes.push((await request(app).post('/api/auth/reset-password').send({ token: 'x'.repeat(43), password: 'a-brand-new-passphrase' })).status);
      expect(resetCodes.at(-1)).toBe(429);
    } finally {
      delete process.env.RATE_LIMITS_IN_TESTS;
    }
  });
});
