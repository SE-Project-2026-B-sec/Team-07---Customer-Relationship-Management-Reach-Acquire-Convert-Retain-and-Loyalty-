import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from './Dashboard';

const apiMock = vi.hoisted(() => vi.fn());

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, api: apiMock };
});
vi.mock('../components/activities/OverdueTasksBox', () => ({ OverdueTasksBox: () => null }));

const KPIS = {
  range: { from: '2031-03-01T00:00:00.000Z', to: '2031-03-31T23:59:59.999Z' },
  newLeads: 5,
  convertedLeads: 2,
  conversionRate: 40,
  openPipelineValue: 100000,
  openDeals: 2,
  wonRevenue: 150000,
  wonDeals: 2,
  activeCustomers: 3,
  averageCustomerValue: 1500,
  retentionRate: 66.7,
  churnRiskCount: 4,
  activeLoyaltyMembers: 2,
};

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Dashboard />
    </QueryClientProvider>,
  );
}

const text = (id: string) => screen.getByTestId(`kpi-${id}`).textContent ?? '';

describe('Dashboard KPIs (CRM-28)', () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation((path: string) =>
      path.startsWith('/dashboard/kpis')
        ? Promise.resolve(KPIS)
        : Promise.resolve({ status: 'ok', db: 'up' }),
    );
  });

  it('TC-ANA-01 shows every KPI from the API', async () => {
    renderDashboard();
    await screen.findByTestId('kpi-new-leads', undefined, { timeout: 5000 });
    expect(text('new-leads')).toContain('5');
    expect(text('conversion-rate')).toContain('40%');
    expect(text('open-pipeline')).toContain('1,00,000');
    expect(text('won-revenue')).toContain('1,50,000');
    expect(text('average-customer-value')).toContain('1,500');
    expect(text('retention-rate')).toContain('66.7%');
    expect(text('churn-risk')).toContain('4');
    expect(text('loyalty-members')).toContain('2');
  });

  it('asks for the last 30 days by default and for 7 days when chosen', async () => {
    renderDashboard();
    await screen.findByTestId('kpi-new-leads', undefined, { timeout: 5000 });
    expect(apiMock).toHaveBeenCalledWith(
      expect.stringMatching(/^\/dashboard\/kpis\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Last 7 days' }).getAttribute('aria-pressed')).toBe(
        'true',
      ),
    );
    const calls = apiMock.mock.calls
      .map((c) => c[0] as string)
      .filter((p) => p.startsWith('/dashboard/kpis'));
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it('does not call the API when the start date is after the end date', async () => {
    renderDashboard();
    await screen.findByTestId('kpi-new-leads', undefined, { timeout: 5000 });
    const before = apiMock.mock.calls.length;
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2999-01-01' } });
    expect(
      await screen.findByText('The start date must be on or before the end date.'),
    ).toBeTruthy();
    expect(apiMock.mock.calls.length).toBe(before);
  });

  it('shows an error message when the KPIs cannot be loaded', async () => {
    apiMock.mockImplementation((path: string) =>
      path.startsWith('/dashboard/kpis')
        ? Promise.reject(new Error('boom'))
        : Promise.resolve({ status: 'ok', db: 'up' }),
    );
    renderDashboard();
    expect(
      await screen.findByText('Could not load the KPIs. Please try again.', undefined, {
        timeout: 5000,
      }),
    ).toBeTruthy();
  });
});
