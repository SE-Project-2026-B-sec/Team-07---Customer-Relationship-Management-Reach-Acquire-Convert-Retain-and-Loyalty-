// CRM-16 E2E: TC-CONV-03 drag a deal from Qualified to Proposal; stage is saved and totals update.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { apiAs, loginAs, openFromMenu, uniqueTag } from './helpers';

interface Deal {
  id: string;
  title: string;
  stage: string;
}

/** Drags with real mouse moves (dnd-kit starts a drag only after the pointer moves 5 px). */
async function drag(page: Page, from: Locator, to: Locator) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error('Drag source or target is not visible');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2, { steps: 5 });
  await page.mouse.move(b.x + b.width / 2, b.y + 60, { steps: 20 });
  await page.mouse.up();
}

const count = async (page: Page, stage: string) =>
  Number(await page.getByTestId(`count-${stage}`).textContent());

test('TC-CONV-03 dragging a deal from Qualified to Proposal saves the new stage', async ({
  page,
  request,
}) => {
  // Set up a Qualified deal through the API.
  const api = await apiAs(request, 'manager@crm.test');
  const [contact] = await api.get<{ id: string }[]>('/deals/contacts');
  const title = `${uniqueTag()} Annual plan`;
  const deal = await api.post<Deal>('/deals', { title, value: 25000, contactId: contact.id });
  await api.patch(`/deals/${deal.id}/stage`, { stage: 'QUALIFIED' });

  await loginAs(page, 'manager@crm.test');
  await openFromMenu(page, 'Deals');

  const qualified = page.getByRole('region', { name: 'Qualified column' });
  const proposal = page.getByRole('region', { name: 'Proposal column' });
  await expect(qualified.getByText(title)).toBeVisible();
  const before = {
    qualified: await count(page, 'QUALIFIED'),
    proposal: await count(page, 'PROPOSAL'),
  };

  await drag(page, page.getByRole('button', { name: `Drag ${title}` }), proposal);

  // The card moves and both column counts update.
  await expect(proposal.getByText(title)).toBeVisible();
  await expect(qualified.getByText(title)).toHaveCount(0);
  await expect(page.getByTestId('count-PROPOSAL')).toHaveText(String(before.proposal + 1));
  await expect(page.getByTestId('count-QUALIFIED')).toHaveText(String(before.qualified - 1));

  // The new stage is saved on the server.
  await expect
    .poll(async () => {
      const list = await api.get<{ data: Deal[] }>('/deals?pageSize=100');
      return list.data.find((d) => d.id === deal.id)?.stage;
    })
    .toBe('PROPOSAL');
});
