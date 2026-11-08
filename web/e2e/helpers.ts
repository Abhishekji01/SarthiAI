import { expect, type APIRequestContext, type Page } from '@playwright/test';

let n = 0;
/** Creates a student through the API and signs the page in by storing the token, like the app does. */
export async function signedInStudent(page: Page, request: APIRequestContext, { onboarded = true, profile = {} as Record<string, unknown> } = {}) {
  n += 1;
  const email = `e2e${Date.now()}${n}@example.test`;
  const password = 'e2e-Password-123';
  const reg = await request.post('/api/auth/register', { data: { name: 'Isha Sharma', email, password } });
  expect(reg.ok(), await reg.text()).toBeTruthy();
  const { token } = (await reg.json()).data;
  if (onboarded || Object.keys(profile).length) {
    const res = await request.patch('/api/profile', { headers: { Authorization: `Bearer ${token}` }, data: { profile, ...(onboarded ? { completeOnboarding: true } : {}) } });
    expect(res.ok(), await res.text()).toBeTruthy();
  }
  await page.addInitScript((t) => { if (!sessionStorage.getItem('e2e.init')) { localStorage.setItem('sarthi.token', t); sessionStorage.setItem('e2e.init', '1'); } }, token);
  return { email, password, token };
}

export async function setTheme(page: Page, scheme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: scheme });
}

/** Latest link of a given kind emailed to this address (dev mailer outbox). */
export async function emailedLink(email: string, kind: string) {
  const { readFileSync, existsSync } = await import('node:fs');
  const { OUTBOX } = await import('./outbox.mjs');
  for (let i = 0; i < 40; i += 1) {
    if (existsSync(OUTBOX)) {
      const msgs = readFileSync(OUTBOX, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
      const hit = msgs.reverse().find((m: { to: string; kind: string }) => m.to === email && m.kind === kind);
      if (hit) return new URL(hit.text.match(/https?:\/\/\S+/)[0]);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No ${kind} email for ${email}`);
}
