import { test, expect } from '@playwright/test';
import { signedInStudent } from './helpers';

test.describe('L4: college picker', () => {
  test('spaces show the full list instead of "No matches"', async ({ page, request }) => {
    await signedInStudent(page, request, { onboarded: false });
    await page.goto('/onboarding');
    const box = page.getByRole('textbox', { name: 'Search your college' });
    await box.fill('   ');
    await expect(page.getByText(/No matches/)).toHaveCount(0);
    await expect(page.locator('.card li button').first()).toBeVisible();
  });

  test('"My institution isn\'t listed" saves the typed name', async ({ page, request }) => {
    const { token } = await signedInStudent(page, request, { onboarded: false });
    await page.goto('/onboarding');
    await page.getByRole('textbox', { name: 'Search your college' }).fill('Govt Polytechnic Zzyzx');
    await expect(page.getByText(/No matches for/)).toBeVisible();
    await page.getByRole('button', { name: "My institution isn't listed" }).click();
    const name = page.getByLabel('Institution name');
    await expect(name).toHaveValue('Govt Polytechnic Zzyzx');
    await name.fill('Government Polytechnic, Zzyzx');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Degree').selectOption('Diploma');
    await page.getByLabel('Current year of study').selectOption('1');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Finish' }).click();
    await page.waitForURL((u) => u.pathname === '/');
    const me = await (await request.get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })).json();
    expect(me.data.user.profile.collegeName).toBe('Government Polytechnic, Zzyzx');
  });
});
