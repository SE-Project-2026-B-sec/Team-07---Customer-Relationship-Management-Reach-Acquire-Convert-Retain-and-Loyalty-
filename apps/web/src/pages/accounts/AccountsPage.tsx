import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/client';

/** CRM-11 (CRM-F-030): accounts (companies) — list with contact counts, search, add, delete. */

const PAGE_SIZE = 20;

type Account = {
  id: string;
  name: string;
  industry?: string | null;
  city?: string | null;
  website?: string | null;
  contactCount: number;
};
type AccountsResponse = { items: Account[]; total: number };

const EMPTY_FORM = { name: '', industry: '', city: '', website: '' };

export function AccountsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (q) params.set('q', q);

  const accounts = useQuery({
    queryKey: ['accounts', params.toString()],
    queryFn: () => api<AccountsResponse>(`/accounts?${params.toString()}`),
  });
  const rows = accounts.data?.items ?? [];
  const total = accounts.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['accounts'] });

  const create = useMutation({
    mutationFn: (body: typeof EMPTY_FORM) =>
      api<Account>('/accounts', {
        method: 'POST',
        body: JSON.stringify({
          name: body.name,
          ...(body.industry && { industry: body.industry }),
          ...(body.city && { city: body.city }),
          ...(body.website && { website: body.website }),
        }),
      }),
    onSuccess: () => {
      setForm(EMPTY_FORM);
      setShowForm(false);
      setError(null);
      refresh();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Could not save the account.'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api<null>(`/accounts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : 'Could not delete the account.'),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(form);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Accounts</h1>
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white"
        >
          {showForm ? 'Cancel' : 'Add account'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={onSubmit}
          aria-label="New account"
          className="mt-4 grid gap-3 rounded border border-slate-200 bg-white p-4 sm:grid-cols-2"
        >
          {(['name', 'industry', 'city', 'website'] as const).map((field) => (
            <label key={field} className="text-sm capitalize">
              {field}
              {field === 'name' && ' *'}
              <input
                type={field === 'website' ? 'url' : 'text'}
                required={field === 'name'}
                placeholder={field === 'website' ? 'https://example.com' : undefined}
                value={form[field]}
                onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                className="mt-1 block w-full rounded border px-3 py-2"
              />
            </label>
          ))}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {create.isPending ? 'Saving…' : 'Save account'}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-4">
        <label className="text-sm">
          Search
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Company name"
            className="mt-1 block w-64 max-w-full rounded border px-3 py-2"
          />
        </label>
      </div>

      <div className="relative mt-4 overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Industry</th>
              <th className="px-3 py-2 font-medium">City</th>
              <th className="px-3 py-2 font-medium">Website</th>
              <th className="px-3 py-2 font-medium">Contacts</th>
              <th className="px-3 py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {accounts.isLoading && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {accounts.isError && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-red-700">
                  Could not load accounts.
                </td>
              </tr>
            )}
            {accounts.data && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-slate-500">
                  No accounts found.
                </td>
              </tr>
            )}
            {rows.map((a) => (
              <tr key={a.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-900">{a.name}</td>
                <td className="px-3 py-2 text-slate-700">{a.industry ?? '—'}</td>
                <td className="px-3 py-2 text-slate-700">{a.city ?? '—'}</td>
                <td className="px-3 py-2 text-slate-700">
                  {a.website ? (
                    <a
                      href={a.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-700 underline"
                    >
                      {a.website.replace(/^https?:\/\//, '')}
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-2 text-slate-700">{a.contactCount}</td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    aria-label={`Delete ${a.name}`}
                    onClick={() => {
                      if (window.confirm(`Delete ${a.name}? Its contacts are kept.`))
                        remove.mutate(a.id);
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

      {accounts.data && (
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
            Page {page} of {totalPages} · {total} accounts
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
