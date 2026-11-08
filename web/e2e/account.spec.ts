import { test, expect } from '@playwright/test';
import { emailedLink } from './helpers';

test.describe('F2: account trust and safety', () => {
  test('sign up → verify-email banner → link confirms the address', async ({ page }) => {
    const email = `verify${Date.now()}${test.info().project.name}@example.test`;
    await page.goto('/welcome');
    await expect(page.getByRole('link', { name: 'Continue with Google' })).toHaveCount(0); // flag off
    await page.getByRole('button', { name: 'Create a free account' }).click();
    await page.getByLabel('Full name').fill('Kavya Nair');
    await page.getByLabel('Email').fill(email);
    const pw = page.getByLabel('Password');
    await pw.fill('password123');
    await expect(page.getByText('This password is too common.')).toBeVisible();
    await pw.fill('monsoon river kite');
    await expect(page.getByText(/Strength: Strong/)).toBeVisible();
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByRole('button', { name: 'Skip for now' }).click();
    const banner = page.getByRole('region', { name: 'Confirm your email' });
    await expect(banner).toContainText(email);
    const link = await emailedLink(email, 'verify_email');
    await page.goto(`${link.pathname}${link.search}`);
    await expect(page.getByRole('heading', { name: 'Email confirmed' })).toBeVisible();
    await page.getByRole('link', { name: 'Go to Home' }).click();
    await expect(page.getByRole('region', { name: 'Confirm your email' })).toHaveCount(0);
  });

  test('Sign out of all devices ends other sessions too', async ({ page, request }) => {
    const email = `alldev${Date.now()}${test.info().project.name}@example.test`;
    const reg = await request.post('/api/auth/register', { data: { name: 'Two Devices', email, password: 'a-long-passphrase' } });
    const other = (await reg.json()).data.token as string;
    await request.patch('/api/profile', { headers: { Authorization: `Bearer ${other}` }, data: { completeOnboarding: true } });
    await page.goto('/welcome');
    await page.getByRole('button', { name: 'I already have an account' }).click();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('a-long-passphrase');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Sign out of all devices' }).click();
    await expect(page.getByText('You are signed out on every device.')).toBeVisible();
    expect((await request.get('/api/auth/me', { headers: { Authorization: `Bearer ${other}` } })).status()).toBe(401);
  });

  test('plain Sign out keeps the other device signed in', async ({ page, request }) => {
    const email = `onedev${Date.now()}${test.info().project.name}@example.test`;
    const reg = await request.post('/api/auth/register', { data: { name: 'One Device', email, password: 'a-long-passphrase' } });
    const other = (await reg.json()).data.token as string;
    await request.patch('/api/profile', { headers: { Authorization: `Bearer ${other}` }, data: { completeOnboarding: true } });
    await page.goto('/welcome');
    await page.getByRole('button', { name: 'I already have an account' }).click();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('a-long-passphrase');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/welcome/);
    expect((await request.get('/api/auth/me', { headers: { Authorization: `Bearer ${other}` } })).status()).toBe(200);
  });
});
