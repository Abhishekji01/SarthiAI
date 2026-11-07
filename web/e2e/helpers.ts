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
