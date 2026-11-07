import { test, expect } from '@playwright/test';
import { signedInStudent } from './helpers';

test.describe('F5: reminders that work when the app is closed', () => {
  test('a listing with a deadline offers an .ics download and a Google Calendar link', async ({ page, request }) => {
    const { token } = await signedInStudent(page, request);
    const list = await (await request.get('/api/opportunities?limit=50&sort=deadline', { headers: { Authorization: `Bearer ${token}` } })).json();
    const o = list.data.find((x: { deadline: string | null }) => x.deadline);
    await page.goto(`/opportunity/${o.id}`);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Add to calendar (.ics)' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(`sarthiai-deadline-${o.id}.ics`);
    const body = await (await import('node:fs')).promises.readFile(await file.path(), 'utf8');
    expect(body).toContain('BEGIN:VEVENT');
    await expect(page.getByRole('button', { name: 'Google Calendar' })).toBeVisible();
  });

  test('a listing without dates offers "Notify me when dates are announced"', async ({ page, request }) => {
    const { token } = await signedInStudent(page, request);
    let o: { id: string } | undefined;
    for (let pageNo = 1; pageNo <= 8 && !o; pageNo += 1) {
      const list = await (await request.get(`/api/opportunities?limit=50&page=${pageNo}`, { headers: { Authorization: `Bearer ${token}` } })).json();
      o = list.data.find((x: { deadline: string | null; availability: string }) => !x.deadline && x.availability !== 'closed');
    }
    test.skip(!o, 'every seeded listing has a deadline');
    await page.goto(`/opportunity/${o.id}`);
    const btn = page.getByRole('button', { name: 'Notify me when dates are announced' });
    await btn.click();
    await expect(page.getByRole('button', { name: /You’ll be notified when dates are announced/ })).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.getByRole('button', { name: /You’ll be notified when dates are announced/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible(); // watching also saves it
  });

  test('Profile has email reminder settings', async ({ page, request }) => {
    await signedInStudent(page, request);
    await page.goto('/profile');
    const digest = page.getByLabel(/Weekly summary/);
    await expect(digest).toBeChecked();
    await digest.click();
    await expect(digest).not.toBeChecked();
    await page.reload();
    await expect(page.getByLabel(/Weekly summary/)).not.toBeChecked();
    await expect(page.getByText(/Emails start once you confirm/)).toBeVisible();
  });
});
