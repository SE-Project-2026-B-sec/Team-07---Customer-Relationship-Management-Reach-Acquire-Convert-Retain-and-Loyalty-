// CRM-21 E2E: TC-RET-01 a Support agent raises an Urgent ticket, sees its 4-hour SLA, then resolves it.
import { expect, test } from '@playwright/test';
import { apiAs, loginAs, openFromMenu, uniqueTag } from './helpers';

test('TC-RET-01 Support raises an Urgent ticket with a 4-hour SLA and resolves it', async ({
  page,
  request,
}) => {
  // Support can read but not create contacts, so the customer is set up as Admin.
  const tag = uniqueTag();
  const customer = `${tag} Customer`;
  const admin = await apiAs(request, 'admin@crm.test');
  await admin.post('/contacts', { name: customer, email: `${tag}@example.com` });
  const subject = `${tag} Order not delivered`;

  await loginAs(page, 'support@crm.test');
  await openFromMenu(page, 'Tickets');
  await page.getByRole('button', { name: 'New ticket' }).click();

  const form = page.getByRole('form', { name: 'New ticket' });
  await form.getByLabel('Subject').fill(subject);
  await form.getByLabel('Description').fill('Parcel is a week late.');
  await form.getByLabel('Find customer').fill(tag);
  await expect(form.getByRole('option', { name: new RegExp(customer) })).toHaveCount(1);
  await form
    .getByRole('combobox', { name: /^Customer/ })
    .selectOption({ label: `${customer} (${tag}@example.com)` });
  await form.getByLabel('Priority').selectOption('URGENT');
  await form.getByRole('button', { name: 'Create ticket' }).click();
  await expect(form).toHaveCount(0);

  // Find it in the list: Urgent, due in about 4 hours, not breached.
  await page.getByLabel('Search', { exact: true }).fill(tag);
  const row = page.getByRole('row').filter({ hasText: subject });
  await expect(row).toContainText('Urgent');
  await expect(row).toContainText(/Due in (3h 5\dm|4h 0m)/);
  await expect(row).toHaveAttribute('data-breached', 'false');
  await expect(row).toContainText('Support Agent');

  // Resolve it.
  await row.getByLabel(`Status of ${subject}`).selectOption('RESOLVED');
  await expect(row).toContainText(/Resolved \d/);
});

test('CRM-21 Sales Manager can open Tickets read-only', async ({ page }) => {
  await loginAs(page, 'manager@crm.test');
  await openFromMenu(page, 'Tickets');

  await expect(page.getByRole('heading', { name: 'Tickets' })).toBeVisible();
  await expect(page.getByRole('row').nth(1)).toBeVisible();
  await expect(page.getByRole('button', { name: 'New ticket' })).toHaveCount(0);
});
