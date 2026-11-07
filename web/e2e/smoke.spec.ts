import { test, expect } from '@playwright/test';
import { signedInStudent } from './helpers';

test('welcome screen loads for a signed-out visitor', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/welcome/);
  await expect(page.getByRole('button', { name: 'Create a free account' })).toBeVisible();
});

test('a signed-in student sees Home', async ({ page, request }) => {
  await signedInStudent(page, request);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Isha Sharma' })).toBeVisible();
});
