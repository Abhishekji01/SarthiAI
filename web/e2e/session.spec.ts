import { test, expect } from '@playwright/test';
import { signedInStudent } from './helpers';

test.describe('L11: the web session lives in an httpOnly cookie', () => {
  test('signing in stores nothing readable by page scripts', async ({ page, request }) => {
    const email = `cookie${Date.now()}${test.info().project.name}@example.test`;
    await request.post('/api/auth/register', { data: { name: 'Cookie Test', email, password: 'a-long-passphrase' } });
    await page.goto('/welcome');
    await page.getByRole('button', { name: 'I already have an account' }).click();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('a-long-passphrase');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/onboarding/);
    expect(await page.evaluate(() => localStorage.getItem('sarthi.token'))).toBeNull();
    expect(await page.evaluate(() => document.cookie)).not.toContain('sarthi_session');
    const cookie = (await page.context().cookies()).find((c) => c.name === 'sarthi_session');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
    // Still signed in after a reload.
    await page.reload();
    await expect(page).toHaveURL(/\/onboarding/);
  });

  test('a token saved by an older version is moved into the cookie and deleted', async ({ page, request }) => {
    await signedInStudent(page, request); // stores the token in localStorage, like older versions did
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Isha Sharma' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('sarthi.token'))).toBeNull();
    expect((await page.context().cookies()).some((c) => c.name === 'sarthi_session' && c.httpOnly)).toBe(true);
  });

  test('a new visitor sees no "session expired" notice', async ({ page }) => {
    await page.goto('/welcome');
    await expect(page.getByText(/session expired/i)).toHaveCount(0);
  });
});
