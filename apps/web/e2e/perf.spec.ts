// CRM-32 TC-PERF-02 (CRM-NF-002): on a 10 Mbps connection the app's first render and the
// dashboard (KPI cards filled with data) each take under 3 seconds.
// Lighthouse covers the public pages (see docs/test-runs/CRM-32-report.md); the dashboard needs a
// login, so it is timed here. For final numbers run against a production build (vite preview).
import { expect, test } from '@playwright/test';
import { PASSWORD } from './helpers';

const LIMIT_MS = 3_000;
const MBPS = (n: number) => (n * 1024 * 1024) / 8; // bytes per second

// Timings only mean something on a production build, not the Vite dev server CI uses, so this
// file runs only in the "perf" project: `npm run test:perf -w apps/web` (see playwright.config).

test('TC-PERF-02 first render and dashboard load in under 3 s on 10 Mbps', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 40,
    downloadThroughput: MBPS(10),
    uploadThroughput: MBPS(5),
  });
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

  // Cold load of the app (same bundle the dashboard uses).
  const t0 = Date.now();
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  const firstRender = Date.now() - t0;

  await page.getByLabel('Email').fill('manager@crm.test');
  await page.getByLabel('Password').fill(PASSWORD);
  const t1 = Date.now();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('kpi-new-leads')).toBeVisible();
  await expect(page.getByTestId('kpi-loyalty-members')).toBeVisible();
  const dashboard = Date.now() - t1;

  console.log(`TC-PERF-02 first render ${firstRender} ms, dashboard after login ${dashboard} ms`);
  await test.info().attach('timings', {
    body: JSON.stringify({ firstRender, dashboard }),
    contentType: 'application/json',
  });
  expect(firstRender).toBeLessThan(LIMIT_MS);
  expect(dashboard).toBeLessThan(LIMIT_MS);
});
