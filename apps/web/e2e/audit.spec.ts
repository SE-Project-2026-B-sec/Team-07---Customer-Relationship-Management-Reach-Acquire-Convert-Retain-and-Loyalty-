// CRM-31 E2E: TC-ANA-05 a deal edited by the Sales Manager shows in the Admin's audit log.
import { expect, test } from '@playwright/test';
import { apiAs, loginAs, openFromMenu, uniqueTag } from './helpers';

test('TC-ANA-05 Admin sees who edited a deal, and when', async ({ page, request }) => {
  const manager = await apiAs(request, 'manager@crm.test');
  const [contact] = await manager.get<{ id: string }[]>('/deals/contacts');
  const title = `${uniqueTag()} Pilot`;
  const deal = await manager.post<{ id: string }>('/deals', {
    title,
    value: 9000,
    contactId: contact.id,
  });
  await manager.patch(`/deals/${deal.id}`, { title: `${title} v2` });

  await loginAs(page, 'admin@crm.test');
  await openFromMenu(page, 'Audit log');
  await page.getByLabel('Record type').selectOption('Deal');
  await page.getByLabel('Action').selectOption('UPDATE');

  const row = page.getByRole('row').filter({ hasText: `title: ${title} → ${title} v2` });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Sales Manager');
  await expect(row).toContainText('Updated');
  await expect(row).toContainText(deal.id.slice(0, 8));
});

test('CRM-31 the Audit log menu is for Admin only', async ({ page }) => {
  await loginAs(page, 'manager@crm.test');
  const menu = page.getByRole('navigation', { name: 'Main' });
  await expect(menu.getByRole('link', { name: 'Reports' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Audit log' })).toHaveCount(0);
});
