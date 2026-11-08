/**
 * Starts the SarthiAI server for end-to-end tests: seeds a throwaway database
 * (dropped first, so every run starts clean), then serves the API + web/dist.
 */
import { spawnSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { rmSync } from 'node:fs';
import { OUTBOX } from './outbox.mjs';

const server = fileURLToPath(new URL('../../server/', import.meta.url));
const env = {
  ...process.env,
  NODE_ENV: 'development',
  PORT: process.env.E2E_PORT ?? '4173',
  MONGODB_URI: process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/sarthiai_e2e',
  JWT_SECRET: randomBytes(32).toString('hex'),
  SERVE_WEB: 'true',
  ENABLE_DAILY_REFRESH: 'false',
  GEMINI_API_KEY: '',
  E2E_RESET_DB: 'true',
  LOG_LEVEL: 'warn',
  MAIL_OUTBOX_FILE: OUTBOX,
  AUTH_REQUESTS_PER_15_MIN: '5000',
  API_REQUESTS_PER_15_MIN: '100000',
};
rmSync(OUTBOX, { force: true });
const seed = spawnSync('node', ['scripts/seed.js', '--reset'], { cwd: server, env, stdio: ['ignore', 'ignore', 'inherit'] });
if (seed.status !== 0) process.exit(seed.status ?? 1);
const child = spawn('node', ['src/server.js'], { cwd: server, env, stdio: 'inherit' });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code) => process.exit(code ?? 0));
