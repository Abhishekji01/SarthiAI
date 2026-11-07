import { test, expect } from '@playwright/test';
import { signedInStudent } from './helpers';

test.describe('L10: static files and 404s', () => {
  test('robots.txt, sitemap.xml and favicon.ico are real files', async ({ request }) => {
    const robots = await request.get('/robots.txt');
    expect(robots.status()).toBe(200);
    expect(robots.headers()['content-type']).toMatch(/text\/plain/);
    expect(await robots.text()).toMatch(/Sitemap: .*\/sitemap\.xml/);
    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.headers()['content-type']).toMatch(/xml/);
    expect(await sitemap.text()).toContain('<urlset');
    const icon = await request.get('/favicon.ico');
    expect(icon.status()).toBe(200);
    expect(icon.headers()['content-type']).toMatch(/icon/);
  });

  test('unknown files are 404 and never the app HTML', async ({ request }) => {
    for (const p of ['/logo.png', '/assets/does-not-exist.js', '/wp-login.php']) {
      const r = await request.get(p);
      expect(r.status(), p).toBe(404);
      expect(await r.text(), p).not.toContain('<div id="root">');
    }
  });

  test('unknown app routes show a Not found page (404 status), signed out and in', async ({ page, request }) => {
    const res = await page.goto('/this-does-not-exist');
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await expect(page).toHaveTitle('Page not found · SarthiAI');
    await signedInStudent(page, request);
    await page.goto('/also/not/here');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await page.getByRole('link', { name: 'Go to Home' }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
