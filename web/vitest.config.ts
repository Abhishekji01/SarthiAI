import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Unit and component tests (jsdom). End-to-end tests live in e2e/ and run with Playwright.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
});
