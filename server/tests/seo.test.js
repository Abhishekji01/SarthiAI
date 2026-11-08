import { describe, it, expect } from 'vitest';
import { isAppRoute, looksLikeFile, robotsTxt, sitemapXml } from '../src/web/seo.js';

describe('L10: static files and unknown paths', () => {
  it('knows the app routes', () => {
    for (const p of ['/', '/discover', '/opportunity/65a1b2c3d4e5f6a7b8c9d0e1', '/profile/edit', '/admin/opportunities', '/reset-password']) expect(isAppRoute(p), p).toBe(true);
    for (const p of ['/nope', '/opportunity/123', '/profile/edit/x', '/wp-admin']) expect(isAppRoute(p), p).toBe(false);
  });
  it('treats paths with a file extension as files', () => {
    for (const p of ['/favicon.ico', '/logo.png', '/assets/old-abc.js', '/wp-login.php', '/sitemap.xml']) expect(looksLikeFile(p), p).toBe(true);
    for (const p of ['/discover', '/index.html', '/opportunity/65a1b2c3d4e5f6a7b8c9d0e1']) expect(looksLikeFile(p), p).toBe(false);
  });
  it('robots.txt allows the site, blocks the API and points to the sitemap', () => {
    expect(robotsTxt()).toMatch(/^User-agent: \*\nAllow: \/\nDisallow: \/api\/\n\nSitemap: https?:\/\/\S+\/sitemap\.xml/);
  });
  it('sitemap.xml is valid XML with absolute, escaped URLs', () => {
    const xml = sitemapXml([{ path: '/opportunity/abc?x=1&y=2', lastmod: '2026-11-01T00:00:00Z' }]);
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
    expect(xml).toMatch(/<loc>https?:\/\/[^<]+\/welcome<\/loc>/);
    expect(xml).toContain('/opportunity/abc?x=1&amp;y=2</loc><lastmod>2026-11-01</lastmod>');
  });
});
