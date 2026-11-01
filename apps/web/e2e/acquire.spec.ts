// CRM-16 E2E: TC-ACQ-01 public website form creates a lead with source Website.
import { expect, test } from '@playwright/test';
import { loginAs, openFromMenu, uniqueTag } from './helpers';

test('TC-ACQ-01 website enquiry appears in the Leads list as a Website lead', async ({ page }) => {
  const tag = uniqueTag();
  const name = `${tag} Visitor`;

  // A visitor fills in the public form (no login).
  await page.goto('/enquiry');
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(`${tag}@example.com`);
  await page.getByLabel('Company (optional)').fill(`${tag} Pvt Ltd`);
  await page.getByRole('button', { name: 'Send enquiry' }).click();
  await expect(page.getByRole('status')).toContainText('Thank you!');

  // A Sales Manager finds it in the Leads list.
  await loginAs(page, 'manager@crm.test');
  await openFromMenu(page, 'Leads');
  await page.getByLabel('Search', { exact: true }).fill(tag);

  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row).toBeVisible();
  await expect(row).toContainText(`${tag}@example.com`);
  await expect(row).toContainText('Website');
});
