import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportsPage, type FunnelReport } from './ReportsPage';

const report: FunnelReport = {
  from: null,
  to: null,
  stages: [
    { key: 'REACHED', label: 'Reached', count: 143, conversionRate: null, dropOff: null },
    { key: 'LEADS', label: 'Leads', count: 50, conversionRate: 35, dropOff: 65 },
    { key: 'QUALIFIED', label: 'Qualified', count: 5, conversionRate: 10, dropOff: 90 },
    { key: 'CUSTOMERS', label: 'Customers', count: 3, conversionRate: 60, dropOff: 40 },
    { key: 'REPEAT', label: 'Repeat customers', count: 2, conversionRate: 66.7, dropOff: 33.3 },
  ],
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function mockServer(options: { exportStatus?: number } = {}) {
  const urls: URL[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input), 'http://x');
    urls.push(url);
    if (url.pathname.endsWith('/export.csv')) {
      if (options.exportStatus) {
        return json({ error: { code: 'FORBIDDEN', message: 'No access' } }, options.exportStatus);
      }
      return new Response('Stage,Count\r\n', {
        headers: { 'Content-Disposition': 'attachment; filename="funnel-2026-11-02.csv"' },
      });
    }
    return json(report);
  });
  return urls;
}

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ReportsPage />
    </QueryClientProvider>,
  );

let clicked: string[] = [];

beforeEach(() => {
  clicked = [];
  // jsdom has no object URLs or real downloads, so record what would be saved.
  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this.download);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ReportsPage (CRM-29)', () => {
  it('TC-ANA-02 shows each funnel stage with its count and drop-off', async () => {
    mockServer();
    renderPage();

    const row = (key: string) =>
      document.querySelector(`tr[data-stage="${key}"]`) as HTMLElement | null;
    await waitFor(() => expect(row('REACHED')).not.toBeNull());

    expect(within(row('REACHED')!).getByText('143')).toBeInTheDocument();
    expect(within(row('REACHED')!).getAllByText('—')).toHaveLength(2);
    expect(within(row('LEADS')!).getByText('35%')).toBeInTheDocument();
    expect(within(row('LEADS')!).getByText('65%')).toBeInTheDocument();
    expect(within(row('REPEAT')!).getByText('Repeat customers')).toBeInTheDocument();
    expect(within(row('REPEAT')!).getByText('33.3%')).toBeInTheDocument();
  });

  it('sends the chosen date range to the API', async () => {
    const urls = mockServer();
    renderPage();
    await screen.findByText('143');

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-31' } });

    await waitFor(() =>
      expect(
        urls.some(
          (u) =>
            u.pathname.endsWith('/reports/funnel') &&
            u.searchParams.get('from') === '2026-10-01' &&
            u.searchParams.get('to') === '2026-10-31',
        ),
      ).toBe(true),
    );
    fireEvent.click(screen.getByRole('button', { name: 'All time' }));
    expect(screen.getByLabelText('From')).toHaveValue('');
  });

  it('warns about a From date after the To date and does not ask the API', async () => {
    const urls = mockServer();
    renderPage();
    await screen.findByText('143');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-30' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-01' } });

    expect(await screen.findByRole('alert')).toHaveTextContent('From date must be on or before');
    // The backwards range itself is never sent.
    expect(urls.some((u) => u.searchParams.get('to') === '2026-11-01')).toBe(false);
  });

  it('TC-ANA-03 Export CSV downloads the funnel with the same date range', async () => {
    const urls = mockServer();
    renderPage();
    await screen.findByText('143');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } });

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    await waitFor(() => expect(clicked).toEqual(['funnel-2026-11-02.csv']));
    const exportUrl = urls.find((u) => u.pathname.endsWith('/reports/funnel/export.csv'))!;
    expect(exportUrl.searchParams.get('from')).toBe('2026-10-01');
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled();
  });

  it('shows the API message when an export is refused', async () => {
    mockServer({ exportStatus: 403 });
    renderPage();
    await screen.findByText('143');

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No access');
    expect(clicked).toEqual([]);
  });
});
