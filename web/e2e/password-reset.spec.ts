import { test, expect } from '@playwright/test';
import { emailedLink } from './helpers';

test('H2: forgot password → email link → new password → signed in', async ({ page, request }) => {
  const email = `reset${Date.now()}${test.info().project.name}@example.test`;
  const reg = await request.post('/api/auth/register', { data: { name: 'Ravi Kumar', email, password: 'first-Password-1' } });
  expect(reg.ok()).toBeTruthy();

  await page.goto('/welcome');
  await page.getByRole('button', { name: 'I already have an account' }).click();
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  const link = await emailedLink(email, 'password_reset');
  await page.goto(`${link.pathname}${link.search}`);
  await page.getByLabel('New password', { exact: true }).fill('second-Password-2');
  await page.getByLabel('Confirm new password').fill('second-Password-2');
  await page.getByRole('button', { name: 'Save new password' }).click();
  // Signed in: onboarding is the first screen for a new account.
  await expect(page).toHaveURL(/\/onboarding/);

  const old = await request.post('/api/auth/login', { data: { email, password: 'first-Password-1' } });
  expect(old.status()).toBe(401);
});
