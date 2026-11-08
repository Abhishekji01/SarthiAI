import { test, expect } from '@playwright/test';
import { signedInStudent } from './helpers';
import { E2E_ADMIN } from './outbox.mjs';

test('F10: a student adds their college; a platform admin approves it; it becomes searchable', async ({ page, request }) => {
  const name = `Test Polytechnic ${Date.now()} ${test.info().project.name}`;
  const { token } = await signedInStudent(page, request, { onboarded: false });
  await page.goto('/onboarding');
  await page.getByRole('button', { name: "My institution isn't listed" }).click();
  await page.getByLabel('Institution name').fill(name);
  await page.getByLabel('City (optional)').fill('Kota');
  await page.getByLabel('State (optional)').selectOption('Rajasthan');
  await page.getByRole('button', { name: 'Skip for now' }).click(); // skipping saves nothing…
  await page.goto('/profile/edit');
  await expect(page.getByText('Your institution')).toHaveCount(0);
  // …so do it through the form properly.
  await page.getByRole('button', { name: "My institution isn't listed" }).click();
  await page.getByLabel('Institution name').fill(name);
  await page.getByLabel('City (optional)').fill('Kota');
  await page.getByLabel('State (optional)').selectOption('Rajasthan');
  await page.getByRole('button', { name: 'Education' }).click();
  await page.getByLabel('Degree').selectOption('Diploma');
  await page.getByLabel('Current year of study').selectOption('1');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page).toHaveURL(/\/profile$/);

  // Admin reviews it.
  await page.context().clearCookies();
  await page.goto('/welcome');
  await page.getByRole('button', { name: 'I already have an account' }).click();
  await page.getByLabel('Email').fill(E2E_ADMIN.email);
  await page.getByLabel('Password').fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.goto('/admin');
  await page.getByRole('button', { name: 'College requests' }).click();
  const card = page.locator('article.card').filter({ hasText: name });
  await expect(card).toContainText('Kota, Rajasthan · 1 student');
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Approved and listed' })).toBeVisible();

  const found = await (await request.get(`/api/colleges?q=${encodeURIComponent(name)}`)).json();
  expect(found.data.map((c: { name: string; listed: boolean }) => [c.name, c.listed])).toEqual([[name, true]]);
  const me = await (await request.get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })).json();
  expect(me.data.user.profile.collegeName).toBe(name);
});
