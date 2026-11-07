import { test, expect } from '@playwright/test';
import { signedInStudent } from './helpers';

test('L7: Roadmap is one tap away on phones too', async ({ page, request }) => {
  await signedInStudent(page, request);
  await page.goto('/discover');
  const nav = test.info().project.name === 'mobile' ? page.locator('nav.tabbar') : page.locator('nav.sidebar');
  await nav.getByRole('link', { name: 'Roadmap' }).click();
  await expect(page).toHaveURL(/\/roadmap$/);
  await expect(nav.getByRole('link', { name: 'Roadmap' })).toHaveClass(/active/);
  if (test.info().project.name === 'mobile') {
    // Five tabs still fit at 320px with 44px+ touch targets.
    await page.setViewportSize({ width: 320, height: 700 });
    const boxes = await page.locator('nav.tabbar a').evaluateAll((as) => as.map((a) => a.getBoundingClientRect()).map((r) => ({ w: r.width, h: r.height })));
    expect(boxes).toHaveLength(5);
    for (const b of boxes) { expect(b.w).toBeGreaterThanOrEqual(44); expect(b.h).toBeGreaterThanOrEqual(44); }
  }
});
