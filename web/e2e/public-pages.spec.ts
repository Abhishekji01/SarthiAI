import { test, expect, type APIRequestContext } from '@playwright/test';

async function anyPublicListing(request: APIRequestContext) {
  const xml = await (await request.get('/sitemap.xml')).text();
  const id = xml.match(/\/opportunity\/([a-f\d]{24})</)![1];
  const o = (await (await request.get(`/api/public/opportunities/${id}`)).json()).data;
  return o as { id: string; title: string; organization: string; sourceUrl: string };
}

test.describe('F1: public, shareable opportunity pages', () => {
  test('a shared link shows the official details without signing in', async ({ page, request }) => {
    const o = await anyPublicListing(request);
    const res = await page.goto(`/opportunity/${o.id}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: o.title })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Source & verification' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sign in to check your eligibility' })).toBeVisible();
    // Personal parts only after sign-in.
    await expect(page.getByText('Why this opportunity?')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Track application' })).toHaveCount(0);
    await expect(page).toHaveTitle(`${o.title} · SarthiAI`);
  });

  test('link previews: the raw HTML has Open Graph, Twitter and canonical tags', async ({ request }) => {
    const o = await anyPublicListing(request);
    const html = await (await request.get(`/opportunity/${o.id}`)).text();
    expect(html).toMatch(/<meta property="og:title" content="[^"]+· SarthiAI" \/>/);
    expect(html).toMatch(/<meta property="og:description" content="[^"]{20,}" \/>/);
    expect(html).toMatch(new RegExp(`<link rel="canonical" href="https?://[^"]+/opportunity/${o.id}" />`));
    expect(html).toContain('<meta name="twitter:card" content="summary" />');
    expect(html).toContain('<div id="root">');
    const sitemap = await (await request.get('/sitemap.xml')).text();
    expect(sitemap).toContain(`/opportunity/${o.id}</loc>`);
  });

  test('signing in from a shared link comes back to it, with eligibility', async ({ page, request }) => {
    const o = await anyPublicListing(request);
    const email = `share${Date.now()}${test.info().project.name}@example.test`;
    const reg = await request.post('/api/auth/register', { data: { name: 'Neha Verma', email, password: 'a-long-passphrase' } });
    const token = (await reg.json()).data.token;
    await request.patch('/api/profile', { headers: { Authorization: `Bearer ${token}` }, data: { completeOnboarding: true } });
    await page.goto(`/opportunity/${o.id}`);
    await page.getByRole('link', { name: 'I have an account' }).click();
    await expect(page).toHaveURL(/\/welcome\?next=/);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('a-long-passphrase');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(new RegExp(`/opportunity/${o.id}$`));
    await expect(page.getByRole('button', { name: /Track application|View in tracker/ }).or(page.getByRole('link', { name: 'View in tracker' }))).toBeVisible();
  });

  test('a new account from a shared link goes through onboarding, then back to the listing', async ({ page, request }) => {
    const o = await anyPublicListing(request);
    await page.goto(`/opportunity/${o.id}`);
    await page.getByRole('link', { name: 'Create a free account' }).click();
    await page.getByLabel('Full name').fill('Arjun Rao');
    await page.getByLabel('Email').fill(`new${Date.now()}${test.info().project.name}@example.test`);
    await page.getByLabel('Password').fill('a-long-passphrase');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/onboarding\?next=/);
    await page.getByRole('button', { name: 'Skip for now' }).click();
    await expect(page).toHaveURL(new RegExp(`/opportunity/${o.id}$`));
  });

  test('a signed-out deep link to an app screen keeps its destination', async ({ page, request }) => {
    const email = `deep${Date.now()}${test.info().project.name}@example.test`;
    const reg = await request.post('/api/auth/register', { data: { name: 'Deep Link', email, password: 'a-long-passphrase' } });
    await request.patch('/api/profile', { headers: { Authorization: `Bearer ${(await reg.json()).data.token}` }, data: { completeOnboarding: true } });
    await page.goto('/discover?type=hackathon');
    await expect(page).toHaveURL(/\/welcome\?next=%2Fdiscover%3Ftype%3Dhackathon/);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('a-long-passphrase');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/discover\?type=hackathon$/);
  });

  test('Share copies the public link when the Web Share API is unavailable', async ({ page, request, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const o = await anyPublicListing(request);
    await page.addInitScript(() => { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); });
    await page.goto(`/opportunity/${o.id}`);
    await page.getByRole('button', { name: 'Share' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Link copied' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(new RegExp(`/opportunity/${o.id}$`));
  });
});
