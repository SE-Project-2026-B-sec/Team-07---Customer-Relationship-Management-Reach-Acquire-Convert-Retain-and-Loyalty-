import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { LEAD_SOURCES, SOURCE_LABEL, type Lead, type LeadSource } from './types';

/** CRM-8 manual lead entry. */
export function NewLeadForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '' });
  const [source, setSource] = useState<LeadSource>('MANUAL');
  const [error, setError] = useState('');

  const set = (field: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const create = useMutation({
    mutationFn: () =>
      api<Lead>('/leads', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          ...(form.phone ? { phone: form.phone } : {}),
          ...(form.company ? { company: form.company } : {}),
          source,
        }),
      }),
    // A duplicate email is still saved; the list shows it with a "Duplicate" badge.
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['leads'] });
      onClose();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Could not save the lead. Try again.'),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    create.mutate();
  }

  const input = 'mt-1 w-full rounded border px-3 py-2';
  return (
    <form
      onSubmit={onSubmit}
      aria-label="New lead"
      className="mt-4 grid max-w-xl gap-3 rounded border border-slate-200 bg-white p-4 sm:grid-cols-2"
    >
      <h2 className="text-lg font-semibold text-slate-900 sm:col-span-2">New lead</h2>
      <label className="text-sm">
        Name
        <input
          value={form.name}
          onChange={set('name')}
          required
          maxLength={120}
          className={input}
        />
      </label>
      <label className="text-sm">
        Email
        <input
          type="email"
          value={form.email}
          onChange={set('email')}
          required
          maxLength={200}
          className={input}
        />
      </label>
      <label className="text-sm">
        Phone (optional)
        <input type="tel" value={form.phone} onChange={set('phone')} className={input} />
      </label>
      <label className="text-sm">
        Company (optional)
        <input value={form.company} onChange={set('company')} maxLength={120} className={input} />
      </label>
      <label className="text-sm sm:col-span-2">
        Source
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as LeadSource)}
          className={input}
        >
          {LEAD_SOURCES.filter((s) => s !== 'IMPORT').map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700 sm:col-span-2">
          {error}
        </p>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {create.isPending ? 'Saving…' : 'Save lead'}
        </button>
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
