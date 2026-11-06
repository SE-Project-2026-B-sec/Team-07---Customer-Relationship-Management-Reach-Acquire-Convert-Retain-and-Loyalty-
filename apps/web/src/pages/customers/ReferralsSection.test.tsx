import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReferralsSection } from './ReferralsSection';
import type { CustomerReferrals } from './types';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const base: CustomerReferrals = {
  contactId: 'c1',
  referralCode: 'REF0001',
  bonusPerReferral: 100,
  bonusEarned: 200,
  referredBy: null,
  referrals: [
    {
      id: 'r1',
      customerId: 'c2',
      customerName: 'Arjun Rao',
      bonusAwarded: true,
      referredAt: '2026-11-03T10:00:00.000Z',
    },
    {
      id: 'r2',
      customerId: 'c3',
      customerName: 'Kavya Iyer',
      bonusAwarded: true,
      referredAt: '2026-11-01T10:00:00.000Z',
    },
  ],
};

function show(body: unknown, status = 200) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json(body, status));
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <ReferralsSection contactId="c1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const stat = (label: string) => screen.getByText(label).parentElement as HTMLElement;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Referrals on Customer 360 (CRM-27)', () => {
  it('TC-LOY-04 shows the code, the customers referred and the bonus earned', async () => {
    show(base);
    const section = await screen.findByRole('region', { name: 'Referrals' });
    expect(within(section).getByText('REF0001')).toBeInTheDocument();
    expect(within(stat('Customers referred')).getByText('2')).toBeInTheDocument();
    expect(within(stat('Bonus points earned')).getByText('200')).toBeInTheDocument();

    const list = within(section).getByRole('list', { name: 'Customers referred' });
    const links = within(list).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Arjun Rao', 'Kavya Iyer']);
    expect(links[0]).toHaveAttribute('href', '/customers/c2');
    expect(within(list).getAllByText(/\+100 points/)).toHaveLength(2);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/customers/c1/referrals'),
      expect.anything(),
    );
  });

  it('shows who referred this customer', async () => {
    show({
      ...base,
      bonusEarned: 0,
      referrals: [],
      referredBy: { id: 'c9', name: 'Priya Menon', referredAt: '2026-10-20T10:00:00.000Z' },
    });
    const link = await screen.findByRole('link', { name: 'Priya Menon' });
    expect(link).toHaveAttribute('href', '/customers/c9');
    expect(screen.getByText('No one has joined with this code yet.')).toBeInTheDocument();
  });

  it('stays hidden if referrals cannot be loaded', async () => {
    show({ error: { code: 'FORBIDDEN', message: 'No access' } }, 403);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('region', { name: 'Referrals' })).not.toBeInTheDocument();
  });
});
