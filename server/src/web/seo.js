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

const htmlEscape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const oneLine = (s, max) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:–—-]+$/, '')}…`;
};
const TYPE = { internship: 'Internship', scholarship: 'Scholarship', fellowship: 'Fellowship', research: 'Research programme', competition: 'Competition', hackathon: 'Hackathon', job: 'Job', program: 'Programme' };

/** Title, description and canonical URL for a public listing page (link previews). */
export function opportunityMeta(o) {
  const deadline = o.deadline ? new Date(new Date(o.deadline).getTime() + 5.5 * 3600000).toISOString().slice(0, 10) : null;
  const fmt = deadline ? new Date(`${deadline}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : null;
  const lead = `${TYPE[o.opportunityType] ?? 'Opportunity'} · ${o.organization}${fmt ? ` · Apply by ${fmt}` : ''}`;
  return {
    title: `${o.title} · SarthiAI`,
    description: oneLine(`${lead}. ${o.summary ?? o.officialDescription ?? 'Verified listing with its official source.'}`, 200),
    url: `${appUrl()}/opportunity/${o._id}`,
    image: `${appUrl()}/icon-512.png`,
  };
}

/** Injects title, description, canonical, Open Graph and Twitter tags into the app shell. */
export function withMeta(indexHtml, meta) {
  const tags = [
    `<title>${htmlEscape(meta.title)}</title>`,
    `<meta name="description" content="${htmlEscape(meta.description)}" />`,
    `<link rel="canonical" href="${htmlEscape(meta.url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="SarthiAI" />`,
    `<meta property="og:title" content="${htmlEscape(meta.title)}" />`,
    `<meta property="og:description" content="${htmlEscape(meta.description)}" />`,
    `<meta property="og:url" content="${htmlEscape(meta.url)}" />`,
    `<meta property="og:image" content="${htmlEscape(meta.image)}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${htmlEscape(meta.title)}" />`,
    `<meta name="twitter:description" content="${htmlEscape(meta.description)}" />`,
    `<meta name="twitter:image" content="${htmlEscape(meta.image)}" />`,
  ].join('\n    ');
  return indexHtml
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta name="description"[^>]*>/, '')
    .replace('</head>', `    ${tags}\n  </head>`);
}
