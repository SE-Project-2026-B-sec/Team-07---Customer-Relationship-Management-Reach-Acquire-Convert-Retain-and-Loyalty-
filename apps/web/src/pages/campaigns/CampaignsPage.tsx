import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api/client';
import { CampaignForm } from './CampaignForm';
import { CampaignResults, SendCampaignPanel } from './CampaignResults';
import {
  CAMPAIGN_STATUSES,
  CHANNEL_LABEL,
  EDITABLE_STATUSES,
  formatDate,
  formatRupees,
  HAS_RESULTS,
  STATUS_LABEL,
  STATUS_STYLE,
  type Campaign,
  type CampaignsPage as CampaignsPageData,
  type CampaignStatus,
} from './types';

const PAGE_SIZE = 20;

/** CRM-18 Campaigns list with create and edit; CRM-19 sending and results. */
export function CampaignsPage() {
  const [status, setStatus] = useState<CampaignStatus | ''>('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  // CRM-19: one panel at a time, either "send?" or the results.
  const [panel, setPanel] = useState<{ kind: 'send' | 'results'; campaign: Campaign } | null>(null);

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (status) params.set('status', status);

  const campaigns = useQuery({
    queryKey: ['campaigns', params.toString()],
    queryFn: () => api<CampaignsPageData>(`/campaigns?${params.toString()}`),
  });

  const totalPages = campaigns.data ? Math.max(1, Math.ceil(campaigns.data.total / PAGE_SIZE)) : 1;

  function openForm(campaign: Campaign | null) {
    setPanel(null);
    setEditing(campaign);
    setShowForm(true);
  }

  function openPanel(kind: 'send' | 'results', campaign: Campaign) {
    setShowForm(false);
    setPanel({ kind, campaign });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Campaigns</h1>
        <button
          type="button"
          onClick={() => openForm(null)}
          className="rounded bg-blue-700 px-4 py-2 text-sm text-white"
        >
          New campaign
        </button>
      </div>

      {showForm && (
        <CampaignForm
          key={editing?.id ?? 'new'}
          campaign={editing ?? undefined}
          onClose={() => setShowForm(false)}
        />
      )}

      {panel?.kind === 'send' && (
        <SendCampaignPanel
          key={panel.campaign.id}
          campaign={panel.campaign}
          onClose={() => setPanel(null)}
          onSent={() => setPanel({ kind: 'results', campaign: panel.campaign })}
        />
      )}
      {panel?.kind === 'results' && (
        <CampaignResults
          key={panel.campaign.id}
          campaign={panel.campaign}
          onClose={() => setPanel(null)}
        />
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Status
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as CampaignStatus | '');
              setPage(1);
            }}
            className="mt-1 block rounded border px-3 py-2"
          >
            <option value="">All</option>
            {CAMPAIGN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {campaigns.isError && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          Could not load campaigns.
        </p>
      )}

      <div className="mt-4 relative overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Channel</th>
              <th className="px-3 py-2 font-medium">Budget</th>
              <th className="px-3 py-2 font-medium">Dates</th>
              <th className="px-3 py-2 font-medium">Segment</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {campaigns.isLoading && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {campaigns.data?.data.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-slate-500">
                  No campaigns found.
                </td>
              </tr>
            )}
            {campaigns.data?.data.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-900">{c.name}</td>
                <td className="px-3 py-2 text-slate-700">{CHANNEL_LABEL[c.channel]}</td>
                <td className="px-3 py-2 text-slate-700">{formatRupees(c.budget)}</td>
                <td className="px-3 py-2 text-slate-700">
                  {formatDate(c.startDate)} – {formatDate(c.endDate)}
                </td>
                <td className="px-3 py-2 text-slate-700">{c.segmentName ?? '—'}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[c.status]}`}>
                    {STATUS_LABEL[c.status]}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    {EDITABLE_STATUSES.includes(c.status) ? (
                      <>
                        <button
                          type="button"
                          aria-label={`Edit ${c.name}`}
                          onClick={() => openForm(c)}
                          className="rounded border border-slate-300 px-3 py-1 text-xs"
                        >
                          Edit
                        </button>
                        {c.segmentId ? (
                          <button
                            type="button"
                            aria-label={`Send ${c.name}`}
                            onClick={() => openPanel('send', c)}
                            className="rounded bg-blue-700 px-3 py-1 text-xs text-white"
                          >
                            Send
                          </button>
                        ) : (
                          <span className="self-center text-xs text-slate-500">
                            Add a segment to send
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="self-center text-xs text-slate-500">Locked</span>
                    )}
                    {HAS_RESULTS.includes(c.status) && (
                      <button
                        type="button"
                        aria-label={`Results for ${c.name}`}
                        onClick={() => openPanel('results', c)}
                        className="rounded border border-slate-300 px-3 py-1 text-xs"
                      >
                        Results
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {campaigns.data && (
        <div className="mt-3 flex items-center gap-3 text-sm text-slate-600">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50"
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages} · {campaigns.data.total} campaigns
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
