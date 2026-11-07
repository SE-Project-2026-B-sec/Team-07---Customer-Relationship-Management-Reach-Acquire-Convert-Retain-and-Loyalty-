import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import { AccountsPage } from '../accounts/AccountsPage';
import { LoyaltyPage } from '../loyalty/LoyaltyPage';
import { AdminUsersPage } from './AdminUsersPage';

vi.mock('../../api/client', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../api/client')>();
  return { ...real, api: vi.fn() };
});
const mockApi = vi.mocked(api);

function renderWith(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Accounts, Loyalty and Admin screens', () => {
  beforeEach(() => mockApi.mockReset());

  it('CRM-11 lists accounts with contact counts', async () => {
    mockApi.mockResolvedValue({
      items: [{ id: 'a1', name: 'Acme Retail', industry: 'Retail', city: 'Pune', contactCount: 3 }],
      total: 1,
    });
    renderWith(<AccountsPage />);
    expect(await screen.findByText('Acme Retail')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('CRM-25/26 shows tiers and the reward catalogue', async () => {
    mockApi.mockImplementation((path: string) =>
      Promise.resolve(
        path === '/tiers'
          ? [{ name: 'SILVER', minPoints: 500 }]
          : [{ id: 'r1', name: 'Coffee voucher', pointsCost: 100, stock: 5, isActive: true }],
      ),
    );
    renderWith(<LoyaltyPage />);
    expect(await screen.findByText('SILVER')).toBeTruthy();
    expect(await screen.findByText('Coffee voucher')).toBeTruthy();
  });

  it('CRM-6 lists users with their status', async () => {
    mockApi.mockResolvedValue([
      { id: 'u1', name: 'Riya Rep', email: 'rep@crm.test', role: 'SALES_REP', isActive: false },
    ]);
    renderWith(<AdminUsersPage />);
    expect(await screen.findByText('Riya Rep')).toBeTruthy();
    expect(screen.getByText('Deactivated')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeTruthy();
  });
});
