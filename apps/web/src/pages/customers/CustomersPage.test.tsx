import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomersPage } from './CustomersPage';
import type { CustomerRow } from './types';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const ROWS: CustomerRow[] = [
  {
    id: 'c1',
    name: 'Priya Sharma',
    email: 'priya@example.test',
    phone: null,
    city: 'Pune',
    tier: 'GOLD',
  },
  {
    id: 'c2',
    name: 'Rohan Iyer',
    email: 'rohan@example.test',
    phone: null,
    city: null,
    tier: 'BRONZE',
  },
];

function mockServer(rows: CustomerRow[] = ROWS) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input), 'http://x');
    if (url.pathname.endsWith('/contacts')) {
      const q = url.searchParams.get('q')?.toLowerCase();
      const found = rows.filter((r) => !q || r.name.toLowerCase().includes(q));
      return json({ items: found, total: found.length, page: 1, pageSize: 20, totalPages: 1 });
    }
    return json({}, 404);
  });
}

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <CustomersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Customers page', () => {
  it('lists customers with their tier and a link to each Customer 360 page', async () => {
    mockServer();
    renderPage();

    await screen.findByText('Priya Sharma');
    expect(screen.getByText('Gold')).toBeInTheDocument();
    expect(screen.getByText('Bronze')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open Customer 360 for Priya Sharma' }),
    ).toHaveAttribute('href', '/customers/c1');
  });

  it('searches by name', async () => {
    const fetchMock = mockServer();
    renderPage();
    await screen.findByText('Rohan Iyer');

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'rohan' } });
    await waitFor(
      () =>
        expect(fetchMock.mock.calls.some(([url]) => String(url).includes('q=rohan'))).toBe(true),
      { timeout: 3000 },
    );
    await screen.findByText('Rohan Iyer');
    await waitFor(() => expect(screen.queryByText('Priya Sharma')).not.toBeInTheDocument());
  });

  it('says so when nobody matches, and when the list cannot be loaded', async () => {
    mockServer([]);
    renderPage();
    expect(await screen.findByText('No customers found.')).toBeInTheDocument();

    cleanup();
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({}, 500));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load customers.');
  });
});
