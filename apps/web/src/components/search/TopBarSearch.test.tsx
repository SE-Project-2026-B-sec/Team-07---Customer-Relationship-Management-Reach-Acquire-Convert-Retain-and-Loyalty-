import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEBOUNCE_MS, TopBarSearch } from './TopBarSearch';
import type { SearchResults } from './types';

const empty: SearchResults = { leads: [], contacts: [], accounts: [], deals: [], tickets: [] };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function mockSearch(results: SearchResults) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json(results));
}

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function renderSearch() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TopBarSearch />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const type = (value: string) =>
  fireEvent.change(screen.getByLabelText('Global search'), { target: { value } });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('TopBarSearch (CRM-15)', () => {
  it('TC-ANA-04 waits for typing to pause, then searches once', async () => {
    const fetchMock = mockSearch(empty);
    renderSearch();

    type('ac');
    type('acm');
    type('acme');
    // Nothing is sent while the user is still typing.
    expect(fetchMock).not.toHaveBeenCalled();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), {
      timeout: DEBOUNCE_MS + 1000,
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/search?q=acme');
  });

  it('TC-ANA-04 shows results grouped by type', async () => {
    mockSearch({
      ...empty,
      accounts: [{ id: 'a1', name: 'Acme Corp', industry: 'Retail' }],
      deals: [{ id: 'd1', title: 'Acme renewal', stage: 'PROPOSAL' }],
    });
    renderSearch();
    type('acme');

    expect(await screen.findByText('Acme Corp', {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Accounts' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Deals' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Leads' })).not.toBeInTheDocument();
  });

  it('CRM-15 clicking a result opens that section and closes the dropdown', async () => {
    mockSearch({ ...empty, deals: [{ id: 'd1', title: 'Acme renewal', stage: 'WON' }] });
    renderSearch();
    type('acme');

    fireEvent.click(await screen.findByText('Acme renewal', {}, { timeout: 2000 }));
    expect(screen.getByTestId('where')).toHaveTextContent('/deals');
    expect(screen.queryByRole('region', { name: 'Search results' })).not.toBeInTheDocument();
  });

  it('CRM-15 shows "No results" when nothing matches', async () => {
    mockSearch(empty);
    renderSearch();
    type('zzzz');

    expect(await screen.findByText('No results', {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it('CRM-15 does not call the API for a 1-character query', async () => {
    const fetchMock = mockSearch(empty);
    renderSearch();
    type('a');

    await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS + 150));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Search results' })).not.toBeInTheDocument();
  });
});
