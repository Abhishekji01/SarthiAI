import { test, expect } from '@playwright/test';
import { signedInStudent } from './helpers';

test('H4: Home category tiles show the same open counts as Find', async ({ page, request }) => {
  await signedInStudent(page, request, { profile: { degree: 'B.Tech', currentYear: 2, branch: 'Computer Science and Engineering' } });
  for (const [label, type] of [['Scholarships', 'scholarship'], ['Internships', 'internship'], ['Hackathons', 'hackathon']] as const) {
    await page.goto('/');
    const tile = page.locator(`a.tile[href="/discover?type=${type}"]`);
    await expect(tile.locator('.num')).not.toHaveText('–');
    const homeCount = Number(await tile.locator('.num').textContent());
    const note = await tile.locator('.tile-note').textContent();
    if (homeCount > 0) expect(note).not.toBe('Nothing open right now');
    await tile.click();
    const results = page.getByText(/^\d+ results?/);
    await expect(results).toBeVisible();
    const findCount = Number((await results.textContent())!.match(/^(\d+)/)![1]);
    expect(findCount, `${label}: Home ${homeCount} vs Find ${findCount}`).toBe(homeCount);
  }
});
