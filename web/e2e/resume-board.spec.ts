import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signedInStudent } from './helpers';
import { makePdf, SAMPLE_RESUME } from '../../server/tests/fixtures/makePdf.js';

test.describe('F8: resume import and tracker board', () => {
  test('resume suggestions are reviewed, then saved only with Save profile', async ({ page, request }) => {
    const { token } = await signedInStudent(page, request, { profile: { skills: ['Python'], degree: 'B.Tech', currentYear: 3 } });
    await page.goto('/profile/edit');
    await page.getByRole('button', { name: 'Projects & links' }).click();
    await page.getByTestId('resume-file').setInputFiles({ name: 'resume.pdf', mimeType: 'application/pdf', buffer: makePdf(SAMPLE_RESUME) });
    const sheet = page.getByRole('dialog', { name: 'Found in your resume' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Java', exact: true }).click(); // untick one skill
    await expect(sheet.getByLabel(/Campus Lost & Found/)).toBeChecked();
    await sheet.getByRole('button', { name: 'Add to my profile' }).click();
    await expect(page.getByText('Software Engineering Intern')).toBeVisible();
    // Not saved yet.
    let me = await (await request.get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })).json();
    expect(me.data.user.profile.projects ?? []).toHaveLength(0);
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page).toHaveURL(/\/profile$/);
    me = await (await request.get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })).json();
    const p = me.data.user.profile;
    expect(p.projects.map((x: { title: string }) => x.title)).toEqual(['Campus Lost & Found', 'Crop Disease Detector']);
    expect(p.experience.map((x: { organization: string }) => x.organization)).toEqual(['Acme Analytics', 'College Tech Club']);
    expect(p.skills).toEqual(expect.arrayContaining(['Python', 'React', 'SQL']));
    expect(p.skills).not.toContain('Java');
  });

  test('board: drag a card or use "Move to"; history is kept', async ({ page, request }) => {
    const { token } = await signedInStudent(page, request);
    const headers = { Authorization: `Bearer ${token}` };
    await request.post('/api/applications', { headers, data: { title: 'Board Test Internship', organization: 'Acme', status: 'interested' } });
    await page.goto('/applications');
    await page.getByRole('button', { name: 'Board', exact: true }).click();
    const card = page.locator('.board-card').filter({ hasText: 'Board Test Internship' });
    await expect(page.getByTestId('column-interested')).toContainText('Board Test Internship');
    if (test.info().project.name === 'desktop') {
      await card.dragTo(page.getByTestId('column-applied'));
      await expect(page.getByTestId('column-applied')).toContainText('Board Test Internship');
    } else {
      await card.getByLabel('Move “Board Test Internship” to').selectOption('applied');
      await expect(page.getByTestId('column-applied')).toContainText('Board Test Internship');
    }
    await page.locator('.board-card').filter({ hasText: 'Board Test Internship' }).getByLabel(/Move/).selectOption('interview');
    await expect(page.getByTestId('column-interview')).toContainText('Board Test Internship');
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations.map((v) => v.id)).toEqual([]);
    // The view is remembered.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Board', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const apps = await (await request.get('/api/applications', { headers })).json();
    expect(apps.data[0].statusHistory.map((h: { status: string }) => h.status)).toEqual(['interested', 'applied', 'interview']);
  });
});
