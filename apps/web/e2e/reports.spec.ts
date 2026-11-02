// CRM-29 E2E: funnel on the Reports page (TC-ANA-02) and CSV downloads (TC-ANA-03).
import { readFile } from 'node:fs/promises';
import { expect, test, type Download } from '@playwright/test';
import { apiAs, loginAs, openFromMenu, uniqueTag } from './helpers';

const lines = async (download: Download) =>
  (await readFile((await download.path())!, 'utf8')).trimEnd().split('\r\n');

test('TC-ANA-02 Sales Manager sees the funnel and downloads it as CSV', async ({ page }) => {
  await loginAs(page, 'manager@crm.test');
  await openFromMenu(page, 'Reports');

  const stages = ['Reached', 'Leads', 'Qualified', 'Customers', 'Repeat customers'];
  for (const stage of stages) {
    await expect(page.getByRole('rowheader', { name: new RegExp(`^${stage}`) })).toBeVisible();
  }

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^funnel-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await lines(download);
  expect(csv[0]).toBe('Stage,Count,Conversion from previous (%),Drop-off from previous (%)');
  expect(csv.slice(1).map((l) => l.split(',')[0])).toEqual(stages);
});

test('TC-ANA-03 exporting a filtered Leads list gives exactly the rows on screen', async ({
  page,
  request,
}) => {
  const tag = uniqueTag();
  const api = await apiAs(request, 'manager@crm.test');
  for (const n of [1, 2, 3]) {
    await api.post('/leads', { name: `${tag} Lead ${n}`, email: `${tag}-${n}@example.com` });
  }

  await loginAs(page, 'manager@crm.test');
  await openFromMenu(page, 'Leads');
  await page.getByLabel('Search', { exact: true }).fill(tag);
  await expect(page.getByText(/· 3 leads$/)).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export CSV' }).click(),
  ]);
  const csv = await lines(download);
  expect(csv).toHaveLength(1 + 3);
  expect(csv.slice(1).every((l) => l.startsWith(`${tag} Lead`))).toBe(true);
});
