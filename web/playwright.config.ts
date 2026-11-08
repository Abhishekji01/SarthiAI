import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the real API + built web app (npm run build first).
 * e2e/server.mjs seeds a throwaway MongoDB database and starts the server on :4173.
 * Needs a MongoDB server: E2E_MONGODB_URI (default mongodb://127.0.0.1:27017/sarthiai_e2e).
 */
const PORT = Number(process.env.E2E_PORT ?? 4173);
export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'list' : 'line',
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 } } },
  ],
  webServer: {
    command: 'node e2e/server.mjs',
    url: `http://127.0.0.1:${PORT}/ready`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
