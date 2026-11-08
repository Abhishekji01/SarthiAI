import { test, expect } from '@playwright/test';
import { signedInStudent } from './helpers';

test('H5: "this month" lists every scholarship closing this month (quick answers, no AI key)', async ({ page, request }) => {
  await signedInStudent(page, request, { profile: { degree: 'B.Tech', currentYear: 2 } });
  await page.goto('/sarthi');
  await page.getByLabel('Message Sarthi').fill('Which scholarships can I apply to this month?');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const bubble = page.locator('.bubble.assistant').last();
  await expect(bubble).toContainText(/close this month|No scholarships close this month/);
  const text = (await bubble.textContent()) ?? '';
  const m = text.match(/(\d+) scholarships close this month/);
  if (m) {
    const items = await bubble.locator('li').count();
    expect(items).toBe(Math.min(Number(m[1]), 25));
  }
  // Citations never point at anything the answer did not name.
  for (const chip of await bubble.locator('a.tag').allTextContents()) expect(text).toContain(chip.replace(/…$/, ''));
});
