import { test, expect } from '@playwright/test';
import { signedInStudent } from './helpers';

test.describe('H1: production build ignores a stored server override', () => {
  test('a stale sarthi.serverUrl is removed and the student stays signed in', async ({ page, request }) => {
    await signedInStudent(page, request);
    await page.addInitScript(() => { if (!sessionStorage.getItem('e2e.url')) { localStorage.setItem('sarthi.serverUrl', 'https://example.com'); sessionStorage.setItem('e2e.url', '1'); } });
    const leaked: string[] = [];
    page.on('request', (r) => { if (!r.url().startsWith('http://127.0.0.1') && r.headers().authorization) leaked.push(r.url()); });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Isha Sharma' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('sarthi.serverUrl'))).toBeNull();
    expect(leaked).toEqual([]);
  });

  test('Profile has no Developer · server item and Welcome has no server button', async ({ page, request }) => {
    await signedInStudent(page, request);
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
    await expect(page.getByText('Developer · server')).toHaveCount(0);
    await page.evaluate(() => localStorage.removeItem('sarthi.token'));
    await page.goto('/welcome');
    await expect(page.getByRole('button', { name: 'Server settings' })).toHaveCount(0);
  });
});
