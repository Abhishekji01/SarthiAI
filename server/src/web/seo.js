import { appUrl } from '../mail/mailer.js';

/**
 * Client-side routes of the web app. Anything else gets the app shell with a
 * 404 status (the app shows its Not found page). Keep in sync with web/src/App.tsx.
 */
const APP_ROUTES = [
  /^\/$/, /^\/welcome$/, /^\/reset-password$/, /^\/verify-email$/, /^\/onboarding$/,
  /^\/discover$/, /^\/opportunity\/[a-f\d]{24}$/i, /^\/sarthi$/, /^\/roadmap$/, /^\/plan$/,
  /^\/applications$/, /^\/saved$/, /^\/drafts$/, /^\/drafts\/[a-f\d]{24}$/i, /^\/documents$/,
  /^\/profile$/, /^\/profile\/edit$/, /^\/admin(\/.*)?$/, /^\/searches$/,
];

export const isAppRoute = (path) => APP_ROUTES.some((rx) => rx.test(path.replace(/\/+$/, '') || '/'));

/** A path that names a file (has an extension) is never answered with the app shell. */
export const looksLikeFile = (path) => /\/[^/]+\.[a-z0-9]{1,8}$/i.test(path) && !/\.html?$/i.test(path);

export function robotsTxt() {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    '',
    `Sitemap: ${appUrl()}/sitemap.xml`,
    '',
  ].join('\n');
}

const xmlEscape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

/** Public pages for search engines. `extra` = [{ path, lastmod }]. */
export function sitemapXml(extra = []) {
  const base = appUrl();
  const urls = [{ path: '/welcome' }, ...extra];
  const body = urls.map((u) => `  <url><loc>${xmlEscape(base + u.path)}</loc>${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString().slice(0, 10)}</lastmod>` : ''}</url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
