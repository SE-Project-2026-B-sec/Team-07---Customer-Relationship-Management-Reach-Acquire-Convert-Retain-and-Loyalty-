// CRM-32 accessibility and small-screen checks.
//   TC-UX-02 (CRM-NF-005): axe finds no critical WCAG 2.1 A/AA issues on the main pages.
//   TC-UX-01 (CRM-NF-004): no horizontal page scroll at 360 px width.
// Pages are opened from the menu as Admin. Serious (non-critical) issues are attached to the
// test report and listed in docs/test-runs/CRM-32-report.md.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { loginAs } from './helpers';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Pages behind login, opened from the menu as Admin (Admin sees every menu item). */
const APP_PAGES = [
  'Dashboard',
  'Campaigns',
  'Segments',
  'Leads',
  'Customers',
  'Deals',
  'Tickets',
  'Reports',
  'Audit log',
];

async function open(page: Page, label: string) {
  const menu = page.getByRole('navigation', { name: 'Main' });
  const link = menu.getByRole('link', { name: label, exact: true });
  // On a phone the menu slides off-screen behind the ☰ button (it still counts as "visible").
  const toggle = page.getByRole('button', { name: 'Toggle menu' });
  if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
  await link.click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Let lists finish loading so axe checks the real content, not a spinner.
  await page.waitForLoadState('networkidle');
}

async function scan(page: Page, name: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const summary = violations.map((v) => ({
    page: name,
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.length,
  }));
  await test.info().attach(`axe-${name}`, {
    body: JSON.stringify(summary, null, 2),
    contentType: 'application/json',
  });
  return summary;
}

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test.describe('TC-UX-02 accessibility (axe, WCAG 2.1 AA)', () => {
  test('public pages have no critical issues', async ({ page }) => {
    const found = [];
    for (const [name, path] of [
      ['Login', '/login'],
      ['Enquiry form', '/enquiry'],
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      found.push(...(await scan(page, name)));
    }
    expect(found.filter((v) => v.impact === 'critical')).toEqual([]);
  });

  test('main app pages have no critical issues', async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, 'admin@crm.test');
    const found = [];
    for (const name of APP_PAGES) {
      await open(page, name);
      found.push(...(await scan(page, name)));
    }
    console.log(`axe: ${found.length} issue types found`, JSON.stringify(found));
    expect(found.filter((v) => v.impact === 'critical')).toEqual([]);
  });
});

test.describe('TC-UX-01 usable at 360 px', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('no page scrolls sideways at 360 px', async ({ page }) => {
    test.setTimeout(120_000);
    const overflow: Record<string, number> = {};

    for (const [name, path] of [
      ['Login', '/login'],
      ['Enquiry form', '/enquiry'],
    ]) {
      await page.goto(path);
      overflow[name] = await horizontalOverflow(page);
    }
    await loginAs(page, 'admin@crm.test');
    for (const name of APP_PAGES) {
      await open(page, name);
      overflow[name] = await horizontalOverflow(page);
    }

    console.log('360px overflow (px):', JSON.stringify(overflow));
    expect(Object.entries(overflow).filter(([, px]) => px > 0)).toEqual([]);
  });
});
