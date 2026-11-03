import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api/client';
import { ExportCsvButton } from '../../components/ExportCsvButton';
import { ChurnRiskSection } from './ChurnRiskSection';

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  conversionRate: number | null;
  dropOff: number | null;
}

export interface FunnelReport {
  from: string | null;
  to: string | null;
  stages: FunnelStage[];
}

/** What each stage means, shown under the chart so the numbers are not a mystery. */
const STAGE_HELP: Record<string, string> = {
  REACHED: 'people sent a campaign message',
  LEADS: 'leads created',
  QUALIFIED: 'of those leads, now qualified or converted',
  CUSTOMERS: 'of those leads, converted to customers',
  REPEAT: 'of those customers, with 2 or more orders',
};

const pct = (n: number | null) => (n === null ? '—' : `${n}%`);

/**
 * CRM-29 Reports: funnel with drop-off between stages (CRM-F-061) and CSV export (CRM-F-062).
 * CRM-23 adds the at-risk customers list below the funnel.
 */
export function ReportsPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const badRange = Boolean(from && to && from > to);

  const funnel = useQuery({
    queryKey: ['funnel', params.toString()],
    queryFn: () => api<FunnelReport>(`/reports/funnel?${params.toString()}`),
    enabled: !badRange,
  });

  const max = Math.max(1, ...(funnel.data?.stages.map((s) => s.count) ?? []));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Reports</h1>
        <ExportCsvButton name="funnel" params={params} />
      </div>

      <section aria-labelledby="funnel-heading" className="mt-4">
        <h2 id="funnel-heading" className="text-lg font-semibold text-slate-900">
          Funnel
        </h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block rounded border px-3 py-2"
            />
          </label>
          <label className="text-sm">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 block rounded border px-3 py-2"
            />
          </label>
          {(from || to) && (
            <button
              type="button"
              onClick={() => {
                setFrom('');
                setTo('');
              }}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            >
              All time
            </button>
          )}
        </div>

        {badRange && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            The From date must be on or before the To date.
          </p>
        )}
        {funnel.isError && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            Could not load the funnel.
          </p>
        )}
        {funnel.isLoading && <p className="mt-3 text-sm text-slate-600">Loading funnel…</p>}

        {funnel.data && !badRange && (
          <div className="mt-4 relative overflow-x-auto rounded border border-slate-200 bg-white">
            <table className="w-full min-w-[560px] text-left text-sm">
              <caption className="sr-only">
                Funnel from reached to repeat customers, with drop-off between stages
              </caption>
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Stage</th>
                  <th className="w-1/3 px-3 py-2 font-medium">
                    <span className="sr-only">Bar</span>
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Count</th>
                  <th className="px-3 py-2 text-right font-medium">From previous</th>
                  <th className="px-3 py-2 text-right font-medium">Drop-off</th>
                </tr>
              </thead>
              <tbody>
                {funnel.data.stages.map((s) => (
                  <tr key={s.key} data-stage={s.key} className="border-t border-slate-100">
                    <th scope="row" className="px-3 py-2 font-medium text-slate-900">
                      {s.label}
                      <span className="block text-xs font-normal text-slate-500">
                        {STAGE_HELP[s.key]}
                      </span>
                    </th>
                    <td className="px-3 py-2" aria-hidden="true">
                      <div className="h-4 rounded bg-slate-100">
                        <div
                          className="h-4 rounded bg-blue-700"
                          style={{ width: `${(s.count / max) * 100}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                      {s.count.toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                      {pct(s.conversionRate)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                      {pct(s.dropOff)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ChurnRiskSection />
    </div>
  );
}
