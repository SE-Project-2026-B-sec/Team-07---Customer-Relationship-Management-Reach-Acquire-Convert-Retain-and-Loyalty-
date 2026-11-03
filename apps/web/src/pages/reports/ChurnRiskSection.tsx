import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

export type ChurnReason = 'NO_RECENT_ORDER' | 'OPEN_HIGH_TICKETS';

export interface AtRiskCustomer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  tier: string;
  lastOrderAt: string | null;
  openHighTickets: number;
  reasons: ChurnReason[];
}

interface AtRiskPage {
  data: AtRiskCustomer[];
  total: number;
}

const SHOWN = 20;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** Plain-English reason(s) a customer is flagged. */
export function reasonText(c: AtRiskCustomer) {
  return c.reasons
    .map((r) =>
      r === 'NO_RECENT_ORDER'
        ? `No order in 90+ days${c.lastOrderAt ? ` (last ${formatDate(c.lastOrderAt)})` : ''}`
        : `${c.openHighTickets} open High/Urgent tickets`,
    )
    .join('; ');
}

/** CRM-23: customers flagged as churn risk (CRM-F-042), with the reason for each. */
export function ChurnRiskSection() {
  const atRisk = useQuery({
    queryKey: ['churn-risk'],
    queryFn: () => api<AtRiskPage>(`/churn-risk?pageSize=${SHOWN}`),
  });

  return (
    <section aria-labelledby="churn-heading" className="mt-8">
      <h2 id="churn-heading" className="text-lg font-semibold text-slate-900">
        At-risk customers
        {atRisk.data && (
          <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-sm font-medium text-amber-900">
            {atRisk.data.total}
          </span>
        )}
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        No order in the last 90 days, or 2 or more open High/Urgent tickets.
      </p>

      {atRisk.isError && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          Could not load at-risk customers.
        </p>
      )}
      {atRisk.isLoading && <p className="mt-3 text-sm text-slate-600">Loading…</p>}
      {atRisk.data?.data.length === 0 && (
        <p className="mt-3 text-sm text-slate-600">No customers are at risk right now.</p>
      )}

      {atRisk.data && atRisk.data.data.length > 0 && (
        <>
          <div className="mt-3 overflow-x-auto rounded border border-slate-200 bg-white">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Tier</th>
                  <th className="px-3 py-2 font-medium">Why</th>
                </tr>
              </thead>
              <tbody>
                {atRisk.data.data.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-900">{c.name}</td>
                    <td className="px-3 py-2 text-slate-700">{c.email}</td>
                    <td className="px-3 py-2 text-slate-700">{c.tier}</td>
                    <td className="px-3 py-2 text-slate-700">{reasonText(c)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {atRisk.data.total > atRisk.data.data.length && (
            <p className="mt-2 text-sm text-slate-600">
              Showing {atRisk.data.data.length} of {atRisk.data.total}.
            </p>
          )}
        </>
      )}
    </section>
  );
}
