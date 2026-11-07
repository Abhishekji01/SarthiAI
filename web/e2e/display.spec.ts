import { test, expect } from '@playwright/test';
import { signedInStudent } from './helpers';

test.describe('L5: display glitches', () => {
  test('Welcome heading reads "Your future, guided."', async ({ page }) => {
    await page.goto('/welcome');
    await expect(page.getByRole('heading', { level: 1, name: 'Your future, guided.' })).toBeVisible();
    const text = await page.getByRole('heading', { level: 1 }).evaluate((h) => (h as HTMLElement).innerText.replace(/\s+/g, ' ').trim());
    expect(text).toBe('Your future, guided.');
  });

  test('Home and Profile show the same initials', async ({ page, request }) => {
    await signedInStudent(page, request);
    await page.goto('/');
    const home = (await page.locator('.avatar-link .avatar').textContent())?.trim();
    await page.goto('/profile');
    const profile = (await page.locator('.avatar').first().textContent())?.trim();
    expect(home).toBe('IS');
    expect(profile).toBe(home);
  });

  test('long official descriptions end at a word, with Read more and the source link', async ({ page, request }) => {
    const { token } = await signedInStudent(page, request);
    const res = await request.get('/api/opportunities?limit=50&type=internship', { headers: { Authorization: `Bearer ${token}` } });
    const long = (await res.json()).data.find((o: { officialDescription: string | null }) => (o.officialDescription?.length ?? 0) > 900);
    test.skip(!long, 'no long description in the seeded data');
    await page.goto(`/opportunity/${long.id}`);
    const desc = page.locator('#official-description');
    await expect(desc).toHaveText(/…$/);
    const readMore = page.getByRole('button', { name: 'Read more' });
    await expect(readMore).toHaveAttribute('aria-expanded', 'false');
    await readMore.click();
    await expect(page.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');
    expect(((await desc.textContent()) ?? '').length).toBeGreaterThan(700);
    await expect(page.getByRole('button', { name: /Read it on the official source/ })).toBeVisible();
  });
});
