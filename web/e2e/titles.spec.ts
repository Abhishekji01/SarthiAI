import { test, expect } from '@playwright/test';
import { signedInStudent } from './helpers';

test('L6: every screen sets its own tab title', async ({ page, request }) => {
  await page.goto('/welcome');
  await expect(page).toHaveTitle('SarthiAI');
  await page.getByRole('button', { name: 'I already have an account' }).click();
  await expect(page).toHaveTitle('Sign in · SarthiAI');

  const { token } = await signedInStudent(page, request);
  const expected: [string, string][] = [
    ['/', 'Home · SarthiAI'], ['/discover', 'Find · SarthiAI'], ['/sarthi', 'Ask Sarthi · SarthiAI'],
    ['/applications', 'Applied · SarthiAI'], ['/roadmap', 'Roadmap · SarthiAI'], ['/plan', 'Your 90-day plan · SarthiAI'],
    ['/saved', 'Saved · SarthiAI'], ['/drafts', 'Drafts · SarthiAI'], ['/profile', 'Profile · SarthiAI'], ['/profile/edit', 'Edit profile · SarthiAI'],
  ];
  for (const [path, title] of expected) {
    await page.goto(path);
    await expect(page, path).toHaveTitle(title);
  }
  const list = await request.get('/api/opportunities?limit=1', { headers: { Authorization: `Bearer ${token}` } });
  const o = (await list.json()).data[0];
  await page.goto(`/opportunity/${o.id}`);
  await expect(page).toHaveTitle(`${o.title} · SarthiAI`);
});
