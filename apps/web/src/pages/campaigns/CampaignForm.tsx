import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import {
  CHANNEL_LABEL,
  CHANNELS,
  dateInputValue,
  type Campaign,
  type Channel,
  type SegmentOption,
} from './types';

type SaveStatus = 'DRAFT' | 'SCHEDULED' | 'ARCHIVED';

const DATE_ERROR = 'End date must be on or after the start date';

/** CRM-18: create a campaign (saved as Scheduled or as a draft) or edit one. */
export function CampaignForm({ campaign, onClose }: { campaign?: Campaign; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: campaign?.name ?? '',
    channel: (campaign?.channel ?? 'EMAIL') as Channel,
    budget: campaign ? String(campaign.budget) : '',
    startDate: campaign ? dateInputValue(campaign.startDate) : '',
    endDate: campaign ? dateInputValue(campaign.endDate) : '',
    segmentId: campaign?.segmentId ?? '',
    status: (campaign?.status === 'DRAFT' ? 'DRAFT' : 'SCHEDULED') as SaveStatus,
  });
  const [error, setError] = useState('');

  // Segments belong to CRM-17 (Balla). Until that endpoint exists, the dropdown stays hidden.
  const segments = useQuery({
    queryKey: ['segments', 'options'],
    queryFn: async () => {
      const res = await api<SegmentOption[] | { data: SegmentOption[] }>('/segments?pageSize=100');
      return Array.isArray(res) ? res : res.data;
    },
    retry: false,
    staleTime: 60_000,
  });

  const set =
    (field: 'name' | 'budget' | 'startDate' | 'endDate') => (e: { target: { value: string } }) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  const save = useMutation({
    mutationFn: (status: SaveStatus) => {
      const body = JSON.stringify({
        name: form.name.trim(),
        channel: form.channel,
        budget: Number(form.budget),
        startDate: form.startDate,
        endDate: form.endDate,
        status,
        ...(segments.isSuccess ? { segmentId: form.segmentId || null } : {}),
      });
      return campaign
        ? api<Campaign>(`/campaigns/${campaign.id}`, { method: 'PATCH', body })
        : api<Campaign>('/campaigns', { method: 'POST', body });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      onClose();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Could not save the campaign. Try again.'),
  });

  function problem(): string {
    if (!form.name.trim()) return 'Name is required';
    const budget = Number(form.budget);
    if (form.budget.trim() === '' || Number.isNaN(budget)) return 'Enter the budget as a number';
    if (budget < 0) return 'Budget cannot be negative';
    if (!form.startDate || !form.endDate) return 'Choose a start date and an end date';
    if (form.endDate < form.startDate) return DATE_ERROR;
    return '';
  }

  function submit(status: SaveStatus) {
    const found = problem();
    setError(found);
    if (!found) save.mutate(status);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit(campaign ? form.status : 'SCHEDULED');
  }

  const input = 'mt-1 w-full rounded border px-3 py-2';
  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label={campaign ? 'Edit campaign' : 'New campaign'}
      className="mt-4 grid max-w-2xl gap-3 rounded border border-slate-200 bg-white p-4 sm:grid-cols-2"
    >
      <h2 className="text-lg font-semibold text-slate-900 sm:col-span-2">
        {campaign ? 'Edit campaign' : 'New campaign'}
      </h2>
      <label className="text-sm sm:col-span-2">
        Name
        <input value={form.name} onChange={set('name')} maxLength={120} className={input} />
      </label>
      <label className="text-sm">
        Channel
        <select
          value={form.channel}
          onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value as Channel }))}
          className={input}
        >
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {CHANNEL_LABEL[c]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Budget (₹)
        <input
          type="number"
          min="0"
          step="0.01"
          value={form.budget}
          onChange={set('budget')}
          className={input}
        />
      </label>
      <label className="text-sm">
        Start date
        <input type="date" value={form.startDate} onChange={set('startDate')} className={input} />
      </label>
      <label className="text-sm">
        End date
        <input type="date" value={form.endDate} onChange={set('endDate')} className={input} />
      </label>
      {segments.isSuccess && (
        <label className="text-sm">
          Segment (optional)
          <select
            value={form.segmentId}
            onChange={(e) => setForm((f) => ({ ...f, segmentId: e.target.value }))}
            className={input}
          >
            <option value="">No segment</option>
            {segments.data.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {campaign && (
        <label className="text-sm">
          Status
          <select
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as SaveStatus }))}
            className={input}
          >
            <option value="DRAFT">Draft</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700 sm:col-span-2">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={save.isPending}
          className="rounded bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {save.isPending ? 'Saving…' : campaign ? 'Save changes' : 'Schedule campaign'}
        </button>
        {!campaign && (
          <button
            type="button"
            disabled={save.isPending}
            onClick={() => submit('DRAFT')}
            className="rounded border border-slate-300 px-4 py-2 text-sm disabled:opacity-60"
          >
            Save as draft
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-slate-300 px-4 py-2 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
