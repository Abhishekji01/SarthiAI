import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { createApp } from './app.js';
import { logger } from './utils/logger.js';
import { startDailyRefresh } from './ingestion/scheduler.js';

logger.setLevel(env.LOG_LEVEL);

export async function start({ mongoUri = env.MONGODB_URI, port = env.PORT } = {}) {
  await connectDatabase(mongoUri);
  const app = createApp();
  const server = app.listen(port, () => {
    logger.info('SarthiAI API listening', { port, ai: env.GEMINI_API_KEY ? 'configured' : 'not configured' });
  });

  // Daily scrape of official sources (on by default in production).
  const refreshOn = (env.ENABLE_DAILY_REFRESH ?? (env.NODE_ENV === 'production' ? 'true' : 'false')) === 'true';
  const stopRefresh = refreshOn
    ? startDailyRefresh({ hourIST: env.REFRESH_HOUR_IST, onStartup: env.REFRESH_ON_START === 'true' })
    : () => {};

  // Reminder / digest emails: hourly while the server runs (when email is configured).
  const jobsOn = (env.ENABLE_NOTIFICATION_JOBS ?? (env.NODE_ENV === 'production' && env.RESEND_API_KEY ? 'true' : 'false')) === 'true';
  const stopJobs = jobsOn ? (await import('./notify/jobs.js')).startNotificationJobs() : () => {};

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopRefresh();
    stopJobs();
    logger.info('Shutting down', { signal });
    server.close(async () => {
      await disconnectDatabase().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch((err) => {
    logger.error('Failed to start', { error: err });
    process.exit(1);
  });
}
