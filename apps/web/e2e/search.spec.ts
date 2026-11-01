// CRM-16 E2E: TC-ANA-04 searching an account name in the top bar shows the account and its deals.
import { expect, test } from '@playwright/test';
import { apiAs, loginAs, uniqueTag } from './helpers';

test('TC-ANA-04 global search for an account name shows the account and its deal', async ({
  page,
  request,
}) => {
  const tag = uniqueTag();
  const accountName = `${tag} Traders`;
  // The deal title does not contain the account name: it must be found through its account.
  const dealTitle = `Renewal ${Date.now()}`;

  const api = await apiAs(request, 'manager@crm.test');
  const account = await api.post<{ id: string }>('/accounts', { name: accountName });
  const contact = await api.post<{ id: string }>('/contacts', {
    name: `${tag} Buyer`,
    email: `${tag}-buyer@example.com`,
    accountId: account.id,
  });
  await api.post('/deals', { title: dealTitle, value: 5000, contactId: contact.id });

  await loginAs(page, 'manager@crm.test');
  await page.getByLabel('Global search').fill(accountName);

  const results = page.getByRole('region', { name: 'Search results' });
  await expect(results.getByRole('region', { name: 'Accounts' })).toContainText(accountName);
  await expect(results.getByRole('region', { name: 'Deals' })).toContainText(dealTitle);

  // Clicking a deal opens the Deals board and closes the dropdown.
  await results.getByRole('button', { name: dealTitle }).click();
  await expect(page).toHaveURL(/\/deals$/);
  await expect(results).toHaveCount(0);
});
