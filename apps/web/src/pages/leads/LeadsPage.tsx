import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useOptionalAuth, type Role } from '../../auth/AuthContext';
import { ImportLeads } from './ImportLeads';
import { NewLeadForm } from './NewLeadForm';
import {
  LEAD_STATUSES,
  SOURCE_LABEL,
  STATUS_LABEL,
  STATUS_STYLE,
  type LeadsPage as LeadsPageData,
  type LeadStatus,
} from './types';

const PAGE_SIZE = 20;
const IMPORT_ROLES: Role[] = ['ADMIN', 'MARKETING', 'SALES_MANAGER'];
/**
 * CRM-8 Leads list. Later stories add to this page:
 * CRM-9 (Dhriti) an "Import CSV" button, CRM-10 (Disha) assign checkboxes,
 * CRM-13 (Disha) a "Convert" button on qualified leads.
 */
export function LeadsPage() {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<LeadStatus | ''>('');
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const role = useOptionalAuth()?.user?.role;
  const canImport = role !== undefined && IMPORT_ROLES.includes(role);

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
  if (status) params.set('status', status);
  if (duplicatesOnly) params.set('duplicates', 'true');

  const leads = useQuery({
    queryKey: ['leads', params.toString()],
    queryFn: () => api<LeadsPageData>(`/leads?${params.toString()}`),
  });

  const totalPages = leads.data ? Math.max(1, Math.ceil(leads.data.total / PAGE_SIZE)) : 1;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Leads</h1>
        <div className="flex gap-2">
          <Link
            to="/enquiry"
            target="_blank"
            className="rounded border border-slate-300 px-4 py-2 text-sm"
          >
            Open website form
          </Link>
          {canImport && (
            <button
              type="button"
              onClick={() => setShowImport(true)}
              className="rounded border border-slate-300 px-4 py-2 text-sm"
            >
              Import CSV
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded bg-blue-700 px-4 py-2 text-sm text-white"
          >
            New lead
          </button>
        </div>
      </div>

      {showForm && <NewLeadForm onClose={() => setShowForm(false)} />}
      {showImport && <ImportLeads onClose={() => setShowImport(false)} />}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Search
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, email or company"
            className="mt-1 block w-64 max-w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Status
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as LeadStatus | '');
              setPage(1);
            }}
            className="mt-1 block rounded border px-3 py-2"
          >
            <option value="">All</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={duplicatesOnly}
            onChange={(e) => {
              setDuplicatesOnly(e.target.checked);
              setPage(1);
            }}
          />
          Duplicates only
        </label>
      </div>

      {leads.isError && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          Could not load leads.
        </p>
      )}

      <div className="mt-4 overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Owner</th>
            </tr>
          </thead>
          <tbody>
            {leads.isLoading && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {leads.data?.data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-slate-500">
                  No leads found.
                </td>
              </tr>
            )}
            {leads.data?.data.map((lead) => (
              <tr key={lead.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-900">
                  {lead.name}
                  {lead.isDuplicate && (
                    <span
                      title="Another lead or customer already uses this email"
                      className="ml-2 rounded bg-orange-100 px-1.5 py-0.5 text-xs font-medium text-orange-800"
                    >
                      Duplicate
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-700">{lead.email}</td>
                <td className="px-3 py-2 text-slate-700">{lead.company ?? '—'}</td>
                <td className="px-3 py-2 text-slate-700">{SOURCE_LABEL[lead.source]}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[lead.status]}`}>
                    {STATUS_LABEL[lead.status]}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-700">{lead.ownerName ?? 'Unassigned'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {leads.data && (
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
            Page {page} of {totalPages} · {leads.data.total} leads
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
