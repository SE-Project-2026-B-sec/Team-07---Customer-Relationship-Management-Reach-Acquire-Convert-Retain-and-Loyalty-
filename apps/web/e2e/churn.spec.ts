// CRM-23 E2E: two open High/Urgent tickets flag the customer as a churn risk.
import { expect, test } from '@playwright/test';
import { apiAs, loginAs, openFromMenu, uniqueTag } from './helpers';

test('CRM-23 a customer with 2 open High/Urgent tickets shows "Churn risk"', async ({
  page,
  request,
}) => {
  const tag = uniqueTag();
  const admin = await apiAs(request, 'admin@crm.test');
  const support = await apiAs(request, 'support@crm.test');
  const calm = await admin.post<{ id: string }>('/contacts', {
    name: `${tag} Calm`,
    email: `${tag}-calm@example.com`,
  });
  const upset = await admin.post<{ id: string }>('/contacts', {
    name: `${tag} Upset`,
    email: `${tag}-upset@example.com`,
  });
  const raise = (contactId: string, priority: string, n: number) =>
    support.post('/tickets', {
      subject: `${tag} issue ${n}`,
      description: 'E2E',
      priority,
      contactId,
    });
  await raise(calm.id, 'HIGH', 1);
  await raise(upset.id, 'HIGH', 2);
  await raise(upset.id, 'URGENT', 3);

  await loginAs(page, 'support@crm.test');
  await openFromMenu(page, 'Tickets');
  await page.getByLabel('Search', { exact: true }).fill(tag);

  const upsetRow = page.getByRole('row').filter({ hasText: `${tag} issue 3` });
  const calmRow = page.getByRole('row').filter({ hasText: `${tag} issue 1` });
  await expect(upsetRow).toContainText('Churn risk');
  await expect(calmRow).toBeVisible();
  await expect(calmRow).not.toContainText('Churn risk');
});

test('CRM-23 Reports shows the at-risk customers section', async ({ page }) => {
  await loginAs(page, 'manager@crm.test');
  await openFromMenu(page, 'Reports');

  const section = page.getByRole('region', { name: /At-risk customers/ });
  await expect(section).toBeVisible();
  await expect(section.getByText('No order in the last 90 days')).toBeVisible();
});
