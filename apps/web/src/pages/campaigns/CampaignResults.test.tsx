import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampaignsPage } from './CampaignsPage';
import type { Campaign, CampaignMetrics } from './types';

const base: Campaign = {
  id: 'c1',
  name: 'Diwali offer',
  channel: 'EMAIL',
  budget: 7000,
  status: 'SCHEDULED',
  startDate: '2026-11-01T00:00:00.000Z',
  endDate: '2026-11-30T00:00:00.000Z',
  segmentId: 's1',
  segmentName: 'Bengaluru customers',
  createdAt: '2026-11-02T10:00:00.000Z',
  updatedAt: '2026-11-02T10:00:00.000Z',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** A small fake of the campaigns API with sending and metrics (TC-REACH-04 numbers). */
function mockServer(campaigns: Campaign[], options: { refuseSend?: string } = {}) {
  const list = campaigns.map((c) => ({ ...c }));
  const metrics: CampaignMetrics = {
    campaignId: 'c1',
    status: 'RUNNING',
    sentAt: '2026-11-03T09:00:00.000Z',
    recipients: 7,
    opens: 0,
    clicks: 0,
    leads: 1,
    openRate: 0,
    clickRate: 0,
    budget: 7000,
    costPerLead: 7000,
  };
  const calls: { method: string; path: string; body?: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = new URL(String(input), 'http://x').pathname.replace('/api/v1', '');
    const method = init?.method ?? 'GET';
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });

    if (path === '/campaigns')
      return json({ data: list, page: 1, pageSize: 20, total: list.length });
    if (path.endsWith('/send')) {
      if (options.refuseSend) {
        return json({ error: { code: 'EMPTY_AUDIENCE', message: options.refuseSend } }, 409);
      }
      list[0].status = 'RUNNING';
      return json({ sent: 7, status: 'RUNNING' });
    }
    if (path.endsWith('/metrics')) return json(metrics);
    if (path.endsWith('/simulate-engagement')) {
      const body = JSON.parse(String(init?.body));
      if (body.clicks > body.opens) {
        return json(
          { error: { code: 'VALIDATION_ERROR', message: 'Clicks cannot be more than opens' } },
          400,
        );
      }
      Object.assign(metrics, {
        opens: body.opens,
        clicks: body.clicks,
        openRate: Math.round((body.opens / 7) * 1000) / 10,
        clickRate: Math.round((body.clicks / 7) * 1000) / 10,
      });
      return json(metrics);
    }
    if (path.endsWith('/complete')) {
      metrics.status = 'COMPLETED';
      list[0].status = 'COMPLETED';
      return json(metrics);
    }
    return json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404);
  });
  return calls;
}

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <CampaignsPage />
    </QueryClientProvider>,
  );

const stat = (label: string) => screen.getByText(label).parentElement as HTMLElement;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CRM-19 campaign sending and results', () => {
  it('asks before sending, then shows the results (TC-REACH-04)', async () => {
    const calls = mockServer([base]);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Send Diwali offer' }));
    const confirm = screen.getByRole('region', { name: 'Send Diwali offer' });
    expect(within(confirm).getByText('Bengaluru customers')).toBeInTheDocument();
    // Nothing is sent until "Send now".
    expect(calls.some((c) => c.path.endsWith('/send'))).toBe(false);

    fireEvent.click(within(confirm).getByRole('button', { name: 'Send now' }));
    const results = await screen.findByRole('region', { name: 'Results for Diwali offer' });
    expect(calls.filter((c) => c.path.endsWith('/send'))).toHaveLength(1);

    await within(results).findByText('Recipients');
    expect(within(stat('Recipients')).getByText('7')).toBeInTheDocument();
    expect(within(stat('Leads generated')).getByText('1')).toBeInTheDocument();
    expect(within(stat('Cost per lead')).getByText('₹7,000')).toBeInTheDocument();

    fireEvent.change(within(results).getByLabelText('Total opens'), { target: { value: '4' } });
    fireEvent.change(within(results).getByLabelText('Total clicks'), { target: { value: '2' } });
    fireEvent.click(within(results).getByRole('button', { name: 'Simulate engagement (demo)' }));

    expect(await within(results).findByText('57.1% open rate')).toBeInTheDocument();
    expect(within(stat('Opens')).getByText('4')).toBeInTheDocument();
    expect(within(stat('Clicks')).getByText('2')).toBeInTheDocument();
    expect(within(results).getByText('28.6% click rate')).toBeInTheDocument();
    expect(calls.find((c) => c.path.endsWith('/simulate-engagement'))?.body).toEqual({
      opens: 4,
      clicks: 2,
    });
  });

  it('cancel closes the confirmation without sending', async () => {
    const calls = mockServer([base]);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Send Diwali offer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('region', { name: 'Send Diwali offer' })).not.toBeInTheDocument();
    expect(calls.some((c) => c.path.endsWith('/send'))).toBe(false);
  });

  it('shows the reason when sending is refused', async () => {
    mockServer([base], { refuseSend: 'This segment has no one to send to' });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Send Diwali offer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send now' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This segment has no one to send to',
    );
  });

  it('only offers Send when the campaign has a segment', async () => {
    mockServer([{ ...base, segmentId: null, segmentName: null }]);
    renderPage();
    expect(await screen.findByText('Add a segment to send')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send Diwali offer' })).not.toBeInTheDocument();
  });

  it('a running campaign is locked, shows Results and can be marked complete', async () => {
    mockServer([{ ...base, status: 'RUNNING' }]);
    renderPage();
    expect(await screen.findByText('Locked')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send Diwali offer' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Results for Diwali offer' }));
    const results = await screen.findByRole('region', { name: 'Results for Diwali offer' });
    fireEvent.click(await within(results).findByRole('button', { name: 'Mark complete' }));
    expect(await within(results).findByText(/^Completed/)).toBeInTheDocument();
    expect(
      within(results).queryByRole('button', { name: 'Mark complete' }),
    ).not.toBeInTheDocument();
  });

  it('shows the error when the simulated numbers are refused', async () => {
    mockServer([{ ...base, status: 'RUNNING' }]);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Results for Diwali offer' }));
    const results = await screen.findByRole('region', { name: 'Results for Diwali offer' });
    fireEvent.change(await within(results).findByLabelText('Total opens'), {
      target: { value: '1' },
    });
    fireEvent.change(within(results).getByLabelText('Total clicks'), { target: { value: '3' } });
    fireEvent.click(within(results).getByRole('button', { name: 'Simulate engagement (demo)' }));
    expect(await within(results).findByRole('alert')).toHaveTextContent(
      'Clicks cannot be more than opens',
    );
  });
});
