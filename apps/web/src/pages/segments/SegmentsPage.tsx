import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { SegmentForm } from './SegmentForm';
import type { Segment, SegmentsPage as SegmentsPageData } from './types';

const PAGE_SIZE = 20;

/** CRM-17 audience segments, used to target campaigns (CRM-18). */
export function SegmentsPage() {
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Segment | null>(null);

  const segments = useQuery({
    queryKey: ['segments', page],
    queryFn: () => api<SegmentsPageData>(`/segments?page=${page}&pageSize=${PAGE_SIZE}`),
  });
  const totalPages = segments.data ? Math.max(1, Math.ceil(segments.data.total / PAGE_SIZE)) : 1;

  function openForm(segment: Segment | null) {
    setEditing(segment);
    setShowForm(true);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Segments</h1>
          <p className="text-sm text-slate-600">
            Groups of customers to target with a{' '}
            <Link to="/campaigns" className="text-blue-800 underline">
              campaign
            </Link>
            .
          </p>
        </div>
        <button
          type="button"
          onClick={() => openForm(null)}
          className="rounded bg-blue-700 px-4 py-2 text-sm text-white"
        >
          New segment
        </button>
      </div>

      {showForm && (
        <SegmentForm
          key={editing?.id ?? 'new'}
          segment={editing ?? undefined}
          onClose={() => setShowForm(false)}
        />
      )}

      {segments.isError && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          Could not load segments.
        </p>
      )}

      <div className="mt-4 overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Rules</th>
              <th className="px-3 py-2 text-right font-medium">Audience</th>
              <th className="px-3 py-2 text-right font-medium">Campaigns</th>
              <th className="px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {segments.isLoading && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {segments.data?.data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-slate-500">
                  No segments yet. Create one to target a campaign.
                </td>
              </tr>
            )}
            {segments.data?.data.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-900">{s.name}</td>
                <td className="px-3 py-2 text-slate-700">{s.summary}</td>
                <td className="px-3 py-2 text-right text-slate-900">
                  {s.audienceSize.toLocaleString('en-IN')}
                </td>
                <td className="px-3 py-2 text-right text-slate-700">{s.campaignCount}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => openForm(s)}
                    aria-label={`Edit ${s.name}`}
                    className="text-sm font-medium text-blue-800 underline"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {segments.data && totalPages > 1 && (
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
            Page {page} of {totalPages}
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
