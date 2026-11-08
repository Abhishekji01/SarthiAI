import { test, expect } from '@playwright/test';
import { signedInStudent } from './helpers';

test.describe('F6: better Find filters', () => {
  test('filters live in the URL, so a filtered list can be shared or reopened', async ({ page, request }) => {
    await signedInStudent(page, request, { profile: { degree: 'B.Tech', currentYear: 2 } });
    await page.goto('/discover?type=internship');
    await page.getByRole('button', { name: 'Soonest deadline' }).click();
    await page.getByRole('button', { name: 'Hide likely not eligible' }).click();
    await expect(page).toHaveURL(/sort=deadline/);
    await expect(page).toHaveURL(/hideIneligible=true/);
    await expect(page.getByText(/soonest deadline first/)).toBeVisible();
    const url = page.url();
    await page.goto('/');
    await page.goto(url);
    await expect(page.getByRole('button', { name: 'Soonest deadline' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Hide likely not eligible' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('amount filter keeps only listings that state at least that much', async ({ page, request }) => {
    const { token } = await signedInStudent(page, request);
    await page.goto('/discover?type=internship');
    await page.getByRole('button', { name: /^Filters/ }).click();
    await page.getByLabel('Stipend or pay at least').selectOption('120000');
    await page.getByRole('button', { name: 'Show results' }).click();
    await expect(page).toHaveURL(/minAmount=120000/);
    const api = await (await request.get('/api/opportunities?type=internship&minAnnualAmount=120000&limit=1', { headers: { Authorization: `Bearer ${token}` } })).json();
    await expect(page.getByText(new RegExp(`^${api.meta.total} results?`))).toBeVisible();
  });

  test('save a search, then manage it on Saved searches', async ({ page, request }) => {
    await signedInStudent(page, request);
    await page.goto('/discover?type=hackathon&sort=deadline');
    await page.getByRole('button', { name: 'Save this search' }).click();
    await page.getByLabel('Name').fill('Hackathons, soonest first');
    await page.getByRole('button', { name: 'Save search' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Search saved' })).toBeVisible();
    await page.getByRole('link', { name: 'Saved searches' }).click();
    await expect(page).toHaveTitle('Saved searches · SarthiAI');
    const row = page.getByRole('listitem').filter({ hasText: 'Hackathons, soonest first' });
    await expect(row.getByText(/results? now/)).toBeVisible();
    await expect(row.getByLabel('Email me new results')).toBeChecked();
    await row.getByLabel('Email me new results').click();
    await expect(row.getByLabel('Email me new results')).not.toBeChecked();
    await row.getByRole('link', { name: 'Hackathons, soonest first' }).click();
    await expect(page).toHaveURL(/\/discover\?type=hackathon&sort=deadline$/);
    await page.goto('/searches');
    await page.getByRole('button', { name: 'Delete Hackathons, soonest first' }).click();
    await expect(page.getByText('No saved searches yet')).toBeVisible();
  });
});
