import { test, expect } from '@playwright/test';
import { signedInStudent } from './helpers';

test('F9: switch the interface to Hindi; the choice is remembered and <html lang> follows', async ({ page, request }) => {
  await signedInStudent(page, request);
  await page.goto('/profile');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('radio', { name: 'हिन्दी (Hindi)' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  await expect(page.getByRole('heading', { name: 'प्रोफ़ाइल' })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  const nav = test.info().project.name === 'mobile' ? page.locator('nav.tabbar') : page.locator('nav.sidebar');
  await expect(nav.getByRole('link', { name: 'होम' })).toBeVisible();
  await nav.getByRole('link', { name: 'होम' }).click();
  await expect(page.getByText(/स्कॉलरशिप/).first()).toBeVisible();
  await page.goto('/profile');
  await page.getByRole('radio', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('F9: a browser set to Hindi starts in Hindi', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'hi-IN' });
  const page = await ctx.newPage();
  await page.goto('/welcome');
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  await expect(page.getByRole('button', { name: 'मुफ़्त अकाउंट बनाएँ' })).toBeVisible();
  await ctx.close();
});
