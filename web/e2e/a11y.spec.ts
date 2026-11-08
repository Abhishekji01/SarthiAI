import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signedInStudent } from './helpers';

/** L1: no WCAG 2 A/AA violations on the main screens, in light and dark mode. */
async function scan(page: Page, label: string) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const summary = r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length}× e.g. ${v.nodes[0].target.join(' ')} — ${v.nodes[0].failureSummary?.split('\n')[1] ?? ''}`);
  expect.soft(summary, `${label}\n${summary.join("\n")}`).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`axe: signed-out welcome (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/welcome');
    await scan(page, '/welcome');
    await page.getByRole('button', { name: 'I already have an account' }).click();
    await scan(page, '/welcome sign in');
  });

  test(`axe: signed-in screens (${scheme})`, async ({ page, request }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const { token } = await signedInStudent(page, request, { profile: { degree: 'B.Tech', currentYear: 2, skills: ['Python'] } });
    const list = await request.get('/api/opportunities?limit=1&type=scholarship', { headers: { Authorization: `Bearer ${token}` } });
    const oppId = (await list.json()).data[0].id;
    for (const path of ['/', '/discover', `/opportunity/${oppId}`, '/sarthi', '/profile', '/profile/edit', '/applications']) {
      await page.goto(path);
      await scan(page, path);
    }
  });
}
