import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { TIER_LABEL, TIER_STYLE, type CustomersPageData } from './types';

const PAGE_SIZE = 20;

/** CRM-22: find a customer, then open their Customer 360 page. Uses the contacts API (CRM-11). */
export function CustomersPage() {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

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

  const customers = useQuery({
    queryKey: ['customers', params.toString()],
    queryFn: () => api<CustomersPageData>(`/contacts?${params.toString()}`),
  });

  const rows = customers.data?.items ?? customers.data?.data ?? [];
  const total = customers.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Customers</h1>

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

      {customers.isError && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          Could not load customers.
        </p>
      )}

      <div className="mt-4 overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">City</th>
              <th className="px-3 py-2 font-medium">Tier</th>
              <th className="px-3 py-2 font-medium">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {customers.isLoading && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {customers.data && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-slate-500">
                  No customers found.
                </td>
              </tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-900">{c.name}</td>
                <td className="px-3 py-2 text-slate-700">{c.email}</td>
                <td className="px-3 py-2 text-slate-700">{c.city ?? '—'}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${TIER_STYLE[c.tier]}`}>
                    {TIER_LABEL[c.tier]}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <Link
                    to={`/customers/${c.id}`}
                    aria-label={`Open Customer 360 for ${c.name}`}
                    className="rounded border border-slate-300 px-3 py-1 text-xs"
                  >
                    Customer 360
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {customers.data && (
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
            Page {page} of {totalPages} · {total} customers
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
