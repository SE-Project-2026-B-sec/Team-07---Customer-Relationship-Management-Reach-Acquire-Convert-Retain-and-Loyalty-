import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import {
  formatDate,
  formatRupees,
  STATUS_LABEL,
  type Campaign,
  type CampaignMetrics,
} from './types';

const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';

/** CRM-19: asks before sending, because a sent campaign cannot be edited or sent again. */
export function SendCampaignPanel({
  campaign,
  onClose,
  onSent,
}: {
  campaign: Campaign;
  onClose: () => void;
  onSent: () => void;
}) {
  const queryClient = useQueryClient();
  const send = useMutation({
    mutationFn: () => api<{ sent: number }>(`/campaigns/${campaign.id}/send`, { method: 'POST' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      onSent();
    },
  });

  return (
    <section
      aria-label={`Send ${campaign.name}`}
      className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm"
    >
      <h2 className="font-semibold text-slate-900">Send “{campaign.name}”?</h2>
      <p className="mt-1 text-slate-700">
        It goes to everyone in the segment <strong>{campaign.segmentName}</strong> who agreed to
        marketing messages. After sending, the campaign is Running and can no longer be edited.
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Demo version: messages are recorded but not actually delivered.
      </p>
      {send.isError && (
        <p role="alert" className="mt-2 text-red-700">
          {errorText(send.error)}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={send.isPending}
          onClick={() => send.mutate()}
          className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
        >
          {send.isPending ? 'Sending…' : 'Send now'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-slate-300 px-4 py-2"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 text-xl font-semibold text-slate-900">{value}</dd>
      {note && <dd className="text-xs text-slate-500">{note}</dd>}
    </div>
  );
}

/** CRM-19: recipients, opens, clicks, leads generated and cost per lead for one campaign. */
export function CampaignResults({
  campaign,
  onClose,
}: {
  campaign: Campaign;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const key = ['campaign-metrics', campaign.id];
  const metrics = useQuery({
    queryKey: key,
    queryFn: () => api<CampaignMetrics>(`/campaigns/${campaign.id}/metrics`),
  });
  const [opens, setOpens] = useState('');
  const [clicks, setClicks] = useState('');

  const refresh = async (data: CampaignMetrics) => {
    queryClient.setQueryData(key, data);
    await queryClient.invalidateQueries({ queryKey: ['campaigns'] });
  };
  const simulate = useMutation({
    mutationFn: (body: { opens: number; clicks: number }) =>
      api<CampaignMetrics>(`/campaigns/${campaign.id}/simulate-engagement`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });
  const complete = useMutation({
    mutationFn: () =>
      api<CampaignMetrics>(`/campaigns/${campaign.id}/complete`, { method: 'POST' }),
    onSuccess: refresh,
  });

  function submitSimulation(e: FormEvent) {
    e.preventDefault();
    simulate.mutate({ opens: Number(opens), clicks: Number(clicks) });
  }

  const m = metrics.data;
  const canSimulate = m && (m.status === 'RUNNING' || m.status === 'COMPLETED');
  const error = simulate.error ?? complete.error;

  return (
    <section
      aria-label={`Results for ${campaign.name}`}
      className="mt-4 rounded border border-slate-200 bg-slate-50 p-4 text-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Results: {campaign.name}</h2>
          {m && (
            <p className="text-slate-600">
              {STATUS_LABEL[m.status]}
              {m.sentAt ? ` · sent ${formatDate(m.sentAt)}` : ' · not sent yet'}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-slate-300 px-3 py-1"
        >
          Close
        </button>
      </div>

      {metrics.isLoading && <p className="mt-3 text-slate-500">Loading…</p>}
      {metrics.isError && (
        <p role="alert" className="mt-3 text-red-700">
          Could not load the results.
        </p>
      )}

      {m && (
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Recipients" value={String(m.recipients)} />
          <Stat label="Opens" value={String(m.opens)} note={`${m.openRate}% open rate`} />
          <Stat label="Clicks" value={String(m.clicks)} note={`${m.clickRate}% click rate`} />
          <Stat label="Leads generated" value={String(m.leads)} />
          <Stat label="Budget" value={formatRupees(m.budget)} />
          <Stat
            label="Cost per lead"
            value={m.costPerLead === null ? '—' : formatRupees(m.costPerLead)}
            note={m.costPerLead === null ? 'No leads yet' : undefined}
          />
        </dl>
      )}

      {error && (
        <p role="alert" className="mt-3 text-red-700">
          {errorText(error)}
        </p>
      )}

      {canSimulate && (
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <form onSubmit={submitSimulation} className="flex flex-wrap items-end gap-2">
            <label>
              Total opens
              <input
                type="number"
                min={0}
                max={m.recipients}
                required
                value={opens}
                onChange={(e) => setOpens(e.target.value)}
                className="mt-1 block w-24 rounded border px-2 py-1"
              />
            </label>
            <label>
              Total clicks
              <input
                type="number"
                min={0}
                required
                value={clicks}
                onChange={(e) => setClicks(e.target.value)}
                className="mt-1 block w-24 rounded border px-2 py-1"
              />
            </label>
            <button
              type="submit"
              disabled={simulate.isPending}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-50"
            >
              Simulate engagement (demo)
            </button>
          </form>
          {m.status === 'RUNNING' && (
            <button
              type="button"
              disabled={complete.isPending}
              onClick={() => complete.mutate()}
              className="rounded bg-slate-800 px-3 py-1.5 text-white disabled:opacity-50"
            >
              Mark complete
            </button>
          )}
        </div>
      )}
    </section>
  );
}
