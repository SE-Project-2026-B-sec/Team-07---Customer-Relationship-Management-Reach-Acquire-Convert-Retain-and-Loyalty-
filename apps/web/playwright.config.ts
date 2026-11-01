// CRM-16: Playwright end-to-end tests. Run with `npm run test:e2e -w apps/web`.
// Starts the local API (port 4000) and the Vite dev server (port 5173) unless they are already
// running. Needs PostgreSQL migrated and seeded (see README).
import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: CI ? 2 : 0,
  workers: CI ? 1 : undefined,
  forbidOnly: CI,
  reporter: CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npx tsx src/index.ts',
      cwd: '../api',
      url: 'http://localhost:4000/api/v1/health',
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
    {
      command: 'npx vite --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: !CI,
      timeout: 120_000,
      // Always use the local API through the Vite proxy, never the deployed one in apps/web/.env.
      env: { VITE_API_URL: '/api/v1' },
    },
  ],
});
