import { useState } from 'react';
import { apiDownload, ApiError } from '../api/client';

interface Props {
  /** Which export: leads, contacts, deals, tickets or funnel. */
  name: 'leads' | 'contacts' | 'deals' | 'tickets' | 'funnel';
  /** The filters currently on screen, so the file matches what the user sees. */
  params?: URLSearchParams;
}

/** CRM-29: "Export CSV" for any list or report (CRM-F-062). */
export function ExportCsvButton({ name, params }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function download() {
    setBusy(true);
    setError('');
    const query = new URLSearchParams(params);
    // Paging is a screen detail; the export always has every matching row.
    query.delete('page');
    query.delete('pageSize');
    const qs = query.toString();
    try {
      await apiDownload(`/reports/${name}/export.csv${qs ? `?${qs}` : ''}`, `${name}.csv`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not export. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="rounded border border-slate-300 bg-white px-4 py-2 text-sm disabled:opacity-60"
      >
        {busy ? 'Exporting…' : 'Export CSV'}
      </button>
      {error && (
        <span role="alert" className="mt-1 text-xs text-red-700">
          {error}
        </span>
      )}
    </span>
  );
}
