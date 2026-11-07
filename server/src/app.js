import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import { isDatabaseReady } from './config/db.js';
import { generalLimiter } from './middleware/rateLimits.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import { opportunitiesRouter, savedRouter, matchesRouter, eligibilityRouter } from './routes/opportunities.js';
import applicationRoutes from './routes/applications.js';
import roadmapRoutes from './routes/roadmap.js';
import aiRoutes from './routes/ai.js';
import draftRoutes from './routes/drafts.js';
import { campusRouter, collegesRouter, meRouter, resourcesRouter } from './routes/campus.js';
import adminRoutes from './routes/admin.js';
import { getAIProvider } from './ai/provider.js';
import { isAppRoute, looksLikeFile, robotsTxt, sitemapXml } from './web/seo.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY);

  const webDist = fileURLToPath(new URL('../../web/dist/', import.meta.url));
  const serveWeb = (env.SERVE_WEB ?? (existsSync(path.join(webDist, 'index.html')) ? 'true' : 'false')) === 'true';

  app.use(helmet({
    contentSecurityPolicy: serveWeb ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'"],
      },
    } : undefined,
  }));
  // Browser origins must be allow-listed. The Android app (Capacitor WebView) uses
  // https://localhost / capacitor://localhost, which are always allowed.
  const APP_ORIGINS = ['https://localhost', 'http://localhost', 'capacitor://localhost'];
  const origins = [...APP_ORIGINS, ...env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)];
  app.use(cors({ origin: origins }));
  app.use(express.json({ limit: '200kb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) }));
  app.get('/ready', (_req, res) => {
    const db = isDatabaseReady();
    res.status(db ? 200 : 503).json({ status: db ? 'ready' : 'not_ready', database: db ? 'connected' : 'disconnected', ai: getAIProvider() ? 'configured' : 'not_configured' });
  });

  app.use('/api', generalLimiter);
  app.use('/api/auth', authRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/colleges', collegesRouter);
  app.use('/api/opportunities', opportunitiesRouter);
  app.use('/api/saved', savedRouter);
  app.use('/api/matches', matchesRouter);
  app.use('/api/eligibility', eligibilityRouter);
  app.use('/api/applications', applicationRoutes);
  app.use('/api/roadmap', roadmapRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/drafts', draftRoutes);
  app.use('/api/campus', campusRouter);
  app.use('/api/me', meRouter);
  app.use('/api/resources', resourcesRouter);
  app.use('/api/admin', adminRoutes);

  if (serveWeb) {
    // Single deployment: the same server hosts the web app (PWA) and the API.
    app.use(express.static(webDist, { index: false, maxAge: '1h', setHeaders: (res, file) => {
      if (/[\\/]assets[\\/]/.test(file)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      if (/sw\.js$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
    } }));
    app.get('/robots.txt', (_req, res) => res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(robotsTxt()));
    app.get('/sitemap.xml', async (_req, res) => res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(sitemapXml()));
    app.get(/^\/(?!api\/|health$|ready$).*/, (req, res) => {
      // Missing files (e.g. /logo.png, /assets/old.js) are a real 404, never the app's HTML.
      if (looksLikeFile(req.path)) return res.status(404).type('text/plain').send('Not found');
      // Unknown app routes still get the app (it shows its Not found page) but with a 404 status.
      res.status(isAppRoute(req.path) ? 200 : 404).sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
