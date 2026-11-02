import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError } from '../api/client';
import { OverdueTasksBox } from '../components/activities/OverdueTasksBox';

interface Health {
  status: string;
  db: string;
}

/** Response of GET /dashboard/kpis (CRM-28 / CRM-F-060). */
interface Kpis {
  range: { from: string; to: string };
  newLeads: number;
  convertedLeads: number;
  conversionRate: number;
  openPipelineValue: number;
  openDeals: number;
  wonRevenue: number;
  wonDeals: number;
  activeCustomers: number;
  averageCustomerValue: number;
  retentionRate: number;
  churnRiskCount: number;
  activeLoyaltyMembers: number;
}

const DAY = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** The last n days including today, as YYYY-MM-DD (UTC, the same days the API uses). */
function lastDays(n: number) {
  const now = new Date();
  return { from: isoDay(new Date(now.getTime() - (n - 1) * DAY)), to: isoDay(now) };
}

const PRESETS = [7, 30, 90];

const rupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
const number = new Intl.NumberFormat('en-IN');

function kpiError(error: unknown) {
  if (error instanceof ApiError && error.status === 400) {
    return 'Please choose a valid date range.';
  }
  return 'Could not load the KPIs. Please try again.';
}

function KpiCard({
  id,
  label,
  value,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div data-testid={`kpi-${id}`} className="rounded border border-slate-200 bg-white p-4">
      <dt className="text-sm font-medium text-slate-700">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-slate-900">{value}</dd>
      <p className="mt-1 text-xs text-slate-600">{hint}</p>
    </div>
  );
}

export function Dashboard() {
  const health = useQuery({ queryKey: ['health'], queryFn: () => api<Health>('/health') });

  const [range, setRange] = useState(() => lastDays(30));
  const validRange = Boolean(range.from) && Boolean(range.to) && range.from <= range.to;

  const kpis = useQuery({
    queryKey: ['dashboard', 'kpis', range.from, range.to],
    queryFn: () => api<Kpis>(`/dashboard/kpis?from=${range.from}&to=${range.to}`),
    enabled: validRange,
    retry: false,
  });

  const k = kpis.data;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>

      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        aria-label="Date range"
        onSubmit={(e) => e.preventDefault()}
      >
        <div>
          <label htmlFor="kpi-from" className="block text-sm font-medium text-slate-700">
            From
          </label>
          <input
            id="kpi-from"
            type="date"
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className="mt-1 rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label htmlFor="kpi-to" className="block text-sm font-medium text-slate-700">
            To
          </label>
          <input
            id="kpi-to"
            type="date"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className="mt-1 rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
        <div className="flex gap-2" role="group" aria-label="Quick ranges">
          {PRESETS.map((n) => {
            const preset = lastDays(n);
            const active = preset.from === range.from && preset.to === range.to;
            return (
              <button
                key={n}
                type="button"
                aria-pressed={active}
                onClick={() => setRange(preset)}
                className={`rounded border px-3 py-1 text-sm ${
                  active
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                }`}
              >
                Last {n} days
              </button>
            );
          })}
        </div>
      </form>

      {!validRange && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          The start date must be on or before the end date.
        </p>
      )}
      {validRange && kpis.isLoading && (
        <p role="status" className="mt-4 text-sm text-slate-600">
          Loading KPIs...
        </p>
      )}
      {validRange && kpis.isError && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {kpiError(kpis.error)}
        </p>
      )}

      {validRange && k && (
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            id="new-leads"
            label="New leads"
            value={number.format(k.newLeads)}
            hint="Created in the range"
          />
          <KpiCard
            id="conversion-rate"
            label="Lead conversion rate"
            value={`${k.conversionRate}%`}
            hint={`${k.convertedLeads} of ${k.newLeads} new leads converted`}
          />
          <KpiCard
            id="open-pipeline"
            label="Open pipeline value"
            value={rupees.format(k.openPipelineValue)}
            hint={`${k.openDeals} open deals created in the range`}
          />
          <KpiCard
            id="won-revenue"
            label="Won revenue"
            value={rupees.format(k.wonRevenue)}
            hint={`${k.wonDeals} deals won in the range`}
          />
          <KpiCard
            id="average-customer-value"
            label="Average customer value"
            value={rupees.format(k.averageCustomerValue)}
            hint={`Lifetime orders of ${k.activeCustomers} customers who ordered in the range`}
          />
          <KpiCard
            id="retention-rate"
            label="Retention rate"
            value={`${k.retentionRate}%`}
            hint="Customers who ordered in the range and have ordered more than once"
          />
          <KpiCard
            id="churn-risk"
            label="Churn-risk customers"
            value={number.format(k.churnRiskCount)}
            hint="Flagged right now, whatever the range"
          />
          <KpiCard
            id="loyalty-members"
            label="Active loyalty members"
            value={number.format(k.activeLoyaltyMembers)}
            hint="Customers with points activity in the range"
          />
        </dl>
      )}

      <div className="mt-6 inline-flex items-center gap-2 rounded border border-slate-200 bg-white px-4 py-3 text-sm">
        <span className="font-medium">API status:</span>
        {health.isLoading && <span>checking...</span>}
        {health.isError && <span className="text-red-700">not reachable</span>}
        {health.data && (
          <span className="text-green-700">
            {health.data.status} (database {health.data.db})
          </span>
        )}
      </div>
      <OverdueTasksBox />
    </div>
  );
}
