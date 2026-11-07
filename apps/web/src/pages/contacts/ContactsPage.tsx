import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import { TIER_LABEL, TIER_STYLE } from '../customers/types';

/**
 * CRM-11 (CRM-F-030): contacts list, search, add and delete.
 * The API already limits a sales rep to their own contacts (TC-CONV-02),
 * gives every new contact a referral code, and rejects a duplicate email with 409.
 */

const PAGE_SIZE = 20;

type Contact = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  city?: string | null;
  tier: keyof typeof TIER_LABEL;
  account?: { id: string; name: string } | null;
};

type ContactsResponse = { items?: Contact[]; data?: Contact[]; total: number };

const EMPTY_FORM = { name: '', email: '', phone: '', city: '' };

export function ContactsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  // Wait until typing pauses before searching.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (q) params.set('q', q);

  const contacts = useQuery({
    queryKey: ['contacts', params.toString()],
    queryFn: () => api<ContactsResponse>(`/contacts?${params.toString()}`),
  });

  const rows = contacts.data?.items ?? contacts.data?.data ?? [];
  const total = contacts.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['contacts'] });

  const create = useMutation({
    mutationFn: (body: typeof EMPTY_FORM) =>
      api<Contact>('/contacts', {
        method: 'POST',
        body: JSON.stringify({
          name: body.name,
          email: body.email,
          ...(body.phone && { phone: body.phone }),
          ...(body.city && { city: body.city }),
        }),
      }),
    onSuccess: () => {
      setForm(EMPTY_FORM);
      setShowForm(false);
      setFormError(null);
      refresh();
    },
    onError: (err) => {
      setFormError(
        err instanceof ApiError && err.status === 409
          ? 'A contact with this email already exists.'
          : err instanceof Error
            ? err.message
            : 'Could not save the contact.',
      );
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api<null>(`/contacts/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    create.mutate(form);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Contacts</h1>
        <button
          type="button"
          onClick={() => {
            setShowForm((s) => !s);
            setFormError(null);
          }}
          className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white"
        >
          {showForm ? 'Cancel' : 'Add contact'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={onSubmit}
          aria-label="New contact"
          className="mt-4 grid gap-3 rounded border border-slate-200 bg-white p-4 sm:grid-cols-2"
        >
          {(['name', 'email', 'phone', 'city'] as const).map((field) => (
            <label key={field} className="text-sm capitalize">
              {field}
              {(field === 'name' || field === 'email') && ' *'}
              <input
                type={field === 'email' ? 'email' : 'text'}
                required={field === 'name' || field === 'email'}
                value={form[field]}
                onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                className="mt-1 block w-full rounded border px-3 py-2"
              />
            </label>
          ))}
          {formError && (
            <p role="alert" className="text-sm text-red-700 sm:col-span-2">
              {formError}
            </p>
          )}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {create.isPending ? 'Saving…' : 'Save contact'}
            </button>
          </div>
        </form>
      )}

      <div className="mt-4">
        <label className="text-sm">
          Search
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, email or phone"
            className="mt-1 block w-64 max-w-full rounded border px-3 py-2"
          />
        </label>
      </div>

      {contacts.isError && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          Could not load contacts.
        </p>
      )}

      <div className="relative mt-4 overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Phone</th>
              <th className="px-3 py-2 font-medium">City</th>
              <th className="px-3 py-2 font-medium">Account</th>
              <th className="px-3 py-2 font-medium">Tier</th>
              <th className="px-3 py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {contacts.isLoading && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {contacts.data && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-slate-500">
                  No contacts found.
                </td>
              </tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-900">{c.name}</td>
                <td className="px-3 py-2 text-slate-700">{c.email}</td>
                <td className="px-3 py-2 text-slate-700">{c.phone ?? '—'}</td>
                <td className="px-3 py-2 text-slate-700">{c.city ?? '—'}</td>
                <td className="px-3 py-2 text-slate-700">{c.account?.name ?? '—'}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${TIER_STYLE[c.tier] ?? ''}`}>
                    {TIER_LABEL[c.tier] ?? c.tier}
                  </span>
                </td>
                <td className="flex gap-2 px-3 py-2">
                  <Link
                    to={`/customers/${c.id}`}
                    className="rounded border border-slate-300 px-3 py-1 text-xs"
                  >
                    Customer 360
                  </Link>
                  <button
                    type="button"
                    aria-label={`Delete ${c.name}`}
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete ${c.name}?`)) remove.mutate(c.id);
                    }}
                    className="rounded border border-red-300 px-3 py-1 text-xs text-red-700"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {remove.isError && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          Could not delete: {remove.error instanceof Error ? remove.error.message : 'error'}
        </p>
      )}

      {contacts.data && (
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
            Page {page} of {totalPages} · {total} contacts
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
