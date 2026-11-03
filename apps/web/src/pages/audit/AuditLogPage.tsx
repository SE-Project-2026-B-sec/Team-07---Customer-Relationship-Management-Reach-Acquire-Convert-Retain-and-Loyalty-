import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api/client';

/** Record types the API audits (apps/api/src/common/audit.ts). */
export const ENTITIES = [
  'Lead',
  'Contact',
  'Account',
  'Deal',
  'Activity',
  'Quote',
  'Ticket',
  'Campaign',
  'Segment',
  'Order',
  'Reward',
  'Redemption',
  'Referral',
  'Tier',
  'LeadScoreRule',
  'User',
] as const;

const ACTIONS = ['CREATE', 'UPDATE', 'DELETE'] as const;
type Action = (typeof ACTIONS)[number];

const ACTION_LABEL: Record<Action, string> = {
  CREATE: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
};

const ACTION_STYLE: Record<Action, string> = {
  CREATE: 'bg-green-100 text-green-900',
  UPDATE: 'bg-blue-100 text-blue-900',
  DELETE: 'bg-red-100 text-red-900',
};

type Row = Record<string, unknown>;

export interface AuditEntry {
  id: string;
  at: string;
  action: Action;
  entity: string;
  entityId: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
  details: {
    changes?: Record<string, { from: unknown; to: unknown }>;
    after?: Row;
    before?: Row;
    bulk?: boolean;
    count?: number;
  } | null;
}

interface AuditPage {
  data: AuditEntry[];
  total: number;
}

const PAGE_SIZE = 25;

const show = (v: unknown) =>
  v === null || v === undefined || v === ''
    ? '—'
    : typeof v === 'object'
      ? JSON.stringify(v)
      : String(v);

/** The record's own name, when it has one, so "Deleted Contact" says which contact. */
const nameOf = (row: Row | undefined) =>
  (row?.name ?? row?.title ?? row?.subject ?? row?.orderNo ?? null) as string | null;

/** One line per change, e.g. "stage: Prospecting → Qualified". */
export function describe(e: AuditEntry): string[] {
  const d = e.details;
  if (!d) return [];
  if (d.bulk) return [`${d.count ?? 0} records at once`];
  if (d.changes)
    return Object.entries(d.changes).map(([f, c]) => `${f}: ${show(c.from)} → ${show(c.to)}`);
  const name = nameOf(e.action === 'DELETE' ? d.before : d.after);
  return name ? [name] : [];
}

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

/** CRM-31: who created, changed or deleted what, and when (CRM-F-064). Admin only. */
export function AuditLogPage() {
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState<Action | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (entity) params.set('entity', entity);
  if (action) params.set('action', action);
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  const logs = useQuery({
    queryKey: ['audit-logs', params.toString()],
    queryFn: () => api<AuditPage>(`/audit-logs?${params.toString()}`),
  });

  const totalPages = logs.data ? Math.max(1, Math.ceil(logs.data.total / PAGE_SIZE)) : 1;
  const filter =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Audit log</h1>
      <p className="mt-1 text-sm text-slate-600">
        Every create, update and delete made in the app, newest first.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Record type
          <select
            value={entity}
            onChange={(e) => filter(setEntity)(e.target.value)}
            className="mt-1 block rounded border px-3 py-2"
          >
            <option value="">All</option>
            {ENTITIES.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Action
          <select
            value={action}
            onChange={(e) => filter(setAction)(e.target.value as Action | '')}
            className="mt-1 block rounded border px-3 py-2"
          >
            <option value="">All</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {ACTION_LABEL[a]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => filter(setFrom)(e.target.value)}
            className="mt-1 block rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => filter(setTo)(e.target.value)}
            className="mt-1 block rounded border px-3 py-2"
          />
        </label>
      </div>

      {logs.isError && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          Could not load the audit log.
        </p>
      )}

      <div className="mt-4 relative overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Who</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Record</th>
              <th className="px-3 py-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.isLoading && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {logs.data?.data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-slate-500">
                  No changes found.
                </td>
              </tr>
            )}
            {logs.data?.data.map((e) => (
              <tr key={e.id} className="border-t border-slate-100 align-top">
                <td className="whitespace-nowrap px-3 py-2 text-slate-700">{formatWhen(e.at)}</td>
                <td className="px-3 py-2 text-slate-900">
                  {e.userName ?? 'System / website'}
                  {e.userEmail && (
                    <span className="block text-xs text-slate-500">{e.userEmail}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${ACTION_STYLE[e.action]}`}>
                    {ACTION_LABEL[e.action]}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-700">
                  {e.entity}
                  <span className="block font-mono text-xs text-slate-500" title={e.entityId}>
                    {e.entityId === '*' ? 'several' : e.entityId.slice(0, 8)}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-700">
                  <ul>
                    {describe(e).map((line) => (
                      <li key={line} className="break-all">
                        {line}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {logs.data && (
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
            Page {page} of {totalPages} · {logs.data.total} entries
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
