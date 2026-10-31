import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { ContactOption, Deal } from './types';

export function NewDealForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [search, setSearch] = useState('');
  const [contactId, setContactId] = useState('');
  const [expectedClose, setExpectedClose] = useState('');
  const [error, setError] = useState('');

  const contacts = useQuery({
    queryKey: ['deal-contacts', search],
    queryFn: () => api<ContactOption[]>(`/deals/contacts?search=${encodeURIComponent(search)}`),
  });

  const create = useMutation({
    mutationFn: () =>
      api<Deal>('/deals', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          value: Number(value),
          contactId,
          ...(expectedClose ? { expectedClose } : {}),
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['deals'] });
      onClose();
    },
    onError: () => setError('Could not create the deal. Check the details and try again.'),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!contactId) {
      setError('Choose a contact for this deal.');
      return;
    }
    create.mutate();
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-label="New deal"
      className="mt-4 grid max-w-xl gap-3 rounded border border-slate-200 bg-white p-4"
    >
      <h2 className="text-lg font-semibold text-slate-900">New deal</h2>
      <label className="text-sm">
        Deal title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      <label className="text-sm">
        Value (₹)
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      <label className="text-sm">
        Find contact
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Type a name or email"
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      <label className="text-sm">
        Contact
        <select
          value={contactId}
          onChange={(e) => setContactId(e.target.value)}
          required
          className="mt-1 w-full rounded border px-3 py-2"
        >
          <option value="">Select a contact</option>
          {contacts.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Expected close date (optional)
        <input
          type="date"
          value={expectedClose}
          onChange={(e) => setExpectedClose(e.target.value)}
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {create.isPending ? 'Creating…' : 'Create deal'}
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
