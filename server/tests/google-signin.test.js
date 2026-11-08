import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';

// Feature flag + test credentials must be set before the app (and env) load.
process.env.FEATURE_GOOGLE_SIGNIN = 'true';
process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
const { default: request } = await import('supertest');
const { connectTestDb, disconnectTestDb, registerStudent } = await import('./helpers.js');
const { User } = await import('../src/models/User.js');

let app;
beforeAll(async () => { app = await connectTestDb('google_signin'); });
afterEach(() => vi.restoreAllMocks());
afterAll(disconnectTestDb);

/** Runs start → (Google) → callback with a scripted token endpoint. */
async function signInWithGoogle(claims, next) {
  const start = await request(app).get('/api/auth/google/start').query(next ? { next } : {});
  expect(start.status).toBe(302);
  const google = new URL(start.headers.location);
  expect(google.origin).toBe('https://accounts.google.com');
  expect(google.searchParams.get('code_challenge_method')).toBe('S256');
  const cookie = start.headers['set-cookie'].find((c) => c.startsWith('sarthi_oauth=')).split(';')[0];
  const idToken = jwt.sign({ iss: 'https://accounts.google.com', aud: process.env.GOOGLE_CLIENT_ID, nonce: google.searchParams.get('nonce'), email_verified: true, exp: Math.floor(Date.now() / 1000) + 300, ...claims }, 'google-signs-this');
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id_token: idToken }), { status: 200 }));
  const cb = await request(app).get('/api/auth/google/callback').query({ code: 'abc', state: google.searchParams.get('state') }).set('Cookie', cookie);
  return { cb, fetchSpy };
}

describe('F2: Continue with Google (flag on)', () => {
  it('creates a verified account, sets the session cookie and returns to next', async () => {
    const { cb, fetchSpy } = await signInWithGoogle({ sub: 'g-1', email: 'Meera@Example.test', name: 'Meera <b>Iyer</b>' }, '/opportunity/65a1b2c3d4e5f6a7b8c9d0e1');
    expect(fetchSpy.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/token');
    expect(String(fetchSpy.mock.calls[0][1].body)).toContain('code_verifier=');
    expect(cb.status).toBe(302);
    expect(cb.headers.location).toBe('/welcome?next=%2Fopportunity%2F65a1b2c3d4e5f6a7b8c9d0e1');
    expect(cb.headers['set-cookie'].some((c) => c.startsWith('sarthi_session=') && /HttpOnly/i.test(c))).toBe(true);
    const u = await User.findOne({ email: 'meera@example.test' }).select('+googleSub').lean();
    expect(u).toMatchObject({ googleSub: 'g-1', name: 'Meera Iyer' });
    expect(u.emailVerifiedAt).toBeTruthy();
  });

  it('links an existing password account with the same verified email', async () => {
    const s = await registerStudent(app);
    const { cb } = await signInWithGoogle({ sub: 'g-2', email: s.email });
    expect(cb.headers.location).toBe('/welcome');
    const u = await User.findById(s.user.id).select('+googleSub').lean();
    expect(u.googleSub).toBe('g-2');
    expect(await User.countDocuments({ email: s.email })).toBe(1);
  });

  it('rejects a wrong audience, wrong nonce, unverified email or bad state', async () => {
    for (const claims of [{ aud: 'someone-else' }, { nonce: 'replayed' }, { email_verified: false }]) {
      const { cb } = await signInWithGoogle({ sub: 'g-x', email: 'x@example.test', ...claims });
      expect(cb.headers.location).toBe('/welcome?error=google');
      expect((cb.headers['set-cookie'] ?? []).some((c) => c.startsWith('sarthi_session=') && !c.startsWith('sarthi_session=;'))).toBe(false);
    }
    const bad = await request(app).get('/api/auth/google/callback').query({ code: 'abc', state: 'forged' });
    expect(bad.headers.location).toBe('/welcome?error=google');
    expect(await User.countDocuments({ email: 'x@example.test' })).toBe(0);
  });

  it('never redirects to another site through next', async () => {
    const start = await request(app).get('/api/auth/google/start').query({ next: '//evil.example' });
    const saved = jwt.decode(start.headers['set-cookie'].find((c) => c.startsWith('sarthi_oauth=')).split(';')[0].split('=')[1]);
    expect(saved.next).toBeNull();
  });
});
