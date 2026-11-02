import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useOptionalAuth } from '../../auth/AuthContext';
import { NewTicketForm } from './NewTicketForm';
import {
  formatDateTime,
  PRIORITIES,
  PRIORITY_LABEL,
  PRIORITY_STYLE,
  slaText,
  STATUS_LABEL,
  STATUSES,
  TICKET_WRITERS,
  type Priority,
  type Status,
  type Ticket,
  type TicketsPage as TicketsPageData,
} from './types';

const PAGE_SIZE = 20;

/**
 * CRM-21 Support tickets with SLA. Tickets past their SLA due time are shown in red with an
 * "SLA breached" badge (the badge means colour is not the only signal).
 */
export function TicketsPage() {
  const queryClient = useQueryClient();
  const role = useOptionalAuth()?.user?.role;
  const canWrite = role !== undefined && TICKET_WRITERS.includes(role);

  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Status | ''>('');
  const [priority, setPriority] = useState<Priority | ''>('');
  const [breachedOnly, setBreachedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  if (priority) params.set('priority', priority);
  if (breachedOnly) params.set('breached', 'true');

  const tickets = useQuery({
    queryKey: ['tickets', params.toString()],
    queryFn: () => api<TicketsPageData>(`/tickets?${params.toString()}`),
  });

  const setTicketStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Status }) =>
      api<Ticket>(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onMutate: () => setError(''),
    onError: () => setError('Could not update the ticket. Please try again.'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['tickets'] }),
  });

  const totalPages = tickets.data ? Math.max(1, Math.ceil(tickets.data.total / PAGE_SIZE)) : 1;
  const resetPage = () => setPage(1);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Tickets</h1>
        {canWrite && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded bg-blue-700 px-4 py-2 text-sm text-white"
          >
            New ticket
          </button>
        )}
      </div>

      {showForm && <NewTicketForm onClose={() => setShowForm(false)} />}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Search
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Subject or customer"
            className="mt-1 block w-64 max-w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Status
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as Status | '');
              resetPage();
            }}
            className="mt-1 block rounded border px-3 py-2"
          >
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Priority
          <select
            value={priority}
            onChange={(e) => {
              setPriority(e.target.value as Priority | '');
              resetPage();
            }}
            className="mt-1 block rounded border px-3 py-2"
          >
            <option value="">All</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={breachedOnly}
            onChange={(e) => {
              setBreachedOnly(e.target.checked);
              resetPage();
            }}
          />
          SLA breached only
        </label>
      </div>

      {(tickets.isError || error) && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error || 'Could not load tickets.'}
        </p>
      )}

      <div className="mt-4 overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Subject</th>
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">Priority</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">SLA</th>
              <th className="px-3 py-2 font-medium">Assignee</th>
            </tr>
          </thead>
          <tbody>
            {tickets.isLoading && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {tickets.data?.data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-slate-500">
                  No tickets found.
                </td>
              </tr>
            )}
            {tickets.data?.data.map((t) => (
              <tr
                key={t.id}
                data-breached={t.breached}
                className={`border-t border-slate-100 ${
                  t.breached ? 'border-l-4 border-l-red-600 bg-red-50' : ''
                }`}
              >
                <td className="px-3 py-2 font-medium text-slate-900">
                  {t.subject}
                  {t.breached && (
                    <span className="ml-2 rounded bg-red-700 px-1.5 py-0.5 text-xs font-medium text-white">
                      SLA breached
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-700">{t.contactName}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${PRIORITY_STYLE[t.priority]}`}>
                    {PRIORITY_LABEL[t.priority]}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {canWrite ? (
                    <select
                      value={t.status}
                      aria-label={`Status of ${t.subject}`}
                      onChange={(e) =>
                        setTicketStatus.mutate({ id: t.id, status: e.target.value as Status })
                      }
                      className="rounded border border-slate-300 px-1 py-1 text-xs"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-slate-700">{STATUS_LABEL[t.status]}</span>
                  )}
                </td>
                <td
                  className={`px-3 py-2 ${t.breached ? 'font-medium text-red-800' : 'text-slate-700'}`}
                  title={`Due ${formatDateTime(t.slaDueAt)}`}
                >
                  {slaText(t)}
                </td>
                <td className="px-3 py-2 text-slate-700">{t.assigneeName ?? 'Unassigned'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {tickets.data && (
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
            Page {page} of {totalPages} · {tickets.data.total} tickets
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
