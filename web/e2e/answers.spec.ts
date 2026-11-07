import { test, expect } from '@playwright/test';
import { signedInStudent } from './helpers';

test('F4: Yes/No answers in "What am I missing?" are remembered and can be cleared', async ({ page, request }) => {
  const { token } = await signedInStudent(page, request, { profile: { degree: 'B.Tech', currentYear: 2 } });
  const list = await (await request.get('/api/opportunities?type=scholarship&limit=50', { headers: { Authorization: `Bearer ${token}` } })).json();
  const o = list.data.find((x: { eligibilityRules: { kind: string }[] }) => x.eligibilityRules.some((r) => r.kind === 'self_declared'));
  test.skip(!o, 'no self-declared criteria in the seeded data');
  await page.goto(`/opportunity/${o.id}`);
  await page.getByRole('button', { name: /What am I missing\?/ }).click();
  const yes = page.getByRole('button', { name: 'Yes', exact: true }).first();
  await yes.click();
  await expect(yes).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await page.getByRole('button', { name: /What am I missing\?/ }).click();
  await expect(page.getByRole('button', { name: 'Yes', exact: true }).first()).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Clear my answers for this listing' }).click();
  await expect(page.getByRole('button', { name: 'Yes', exact: true }).first()).toHaveAttribute('aria-pressed', 'false');
});
