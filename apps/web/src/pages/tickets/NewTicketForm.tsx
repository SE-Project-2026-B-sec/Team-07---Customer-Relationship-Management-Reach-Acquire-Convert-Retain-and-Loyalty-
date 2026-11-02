import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import {
  PRIORITIES,
  PRIORITY_LABEL,
  type Assignee,
  type ContactOption,
  type Priority,
  type Ticket,
} from './types';

/** CRM-21: raise a ticket for a contact. The API sets the SLA due time from the priority. */
export function NewTicketForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [contactId, setContactId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [error, setError] = useState('');

  // Wait until typing pauses before searching contacts.
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const contacts = useQuery({
    queryKey: ['ticket-contacts', q],
    queryFn: () =>
      api<{ items: ContactOption[] }>(
        `/contacts?pageSize=20${q ? `&q=${encodeURIComponent(q)}` : ''}`,
      ),
  });

  const assignees = useQuery({
    queryKey: ['ticket-assignees'],
    queryFn: () => api<Assignee[]>('/tickets/assignees'),
  });

  const create = useMutation({
    mutationFn: () =>
      api<Ticket>('/tickets', {
        method: 'POST',
        body: JSON.stringify({
          subject: subject.trim(),
          description: description.trim(),
          priority,
          contactId,
          ...(assigneeId ? { assigneeId } : {}),
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
      onClose();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Could not save the ticket. Try again.'),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!contactId) {
      setError('Choose the customer this ticket is for.');
      return;
    }
    create.mutate();
  }

  const input = 'mt-1 w-full rounded border px-3 py-2';
  return (
    <form
      onSubmit={onSubmit}
      aria-label="New ticket"
      className="mt-4 grid max-w-2xl gap-3 rounded border border-slate-200 bg-white p-4 sm:grid-cols-2"
    >
      <h2 className="text-lg font-semibold text-slate-900 sm:col-span-2">New ticket</h2>
      <label className="text-sm sm:col-span-2">
        Subject
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          maxLength={200}
          className={input}
        />
      </label>
      <label className="text-sm sm:col-span-2">
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          maxLength={5000}
          rows={3}
          className={input}
        />
      </label>
      <label className="text-sm">
        Find customer
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name, email or phone"
          className={input}
        />
      </label>
      <label className="text-sm">
        Customer
        <select
          value={contactId}
          onChange={(e) => setContactId(e.target.value)}
          required
          className={input}
        >
          <option value="">Select a customer</option>
          {contacts.data?.items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.email})
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Priority
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          className={input}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Assign to (optional)
        <select
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          className={input}
        >
          <option value="">Me (Support) / unassigned</option>
          {assignees.data?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
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
          {create.isPending ? 'Saving…' : 'Create ticket'}
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
