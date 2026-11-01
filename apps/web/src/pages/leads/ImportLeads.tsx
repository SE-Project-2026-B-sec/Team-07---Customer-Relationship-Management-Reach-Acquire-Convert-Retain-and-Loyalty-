import { useQueryClient } from '@tanstack/react-query';
import { useState, type ChangeEvent } from 'react';
import { api, ApiError } from '../../api/client';
import {
  BATCH_SIZE,
  LEAD_CSV_TEMPLATE,
  parseLeadsCsv,
  type ImportReport,
  type ImportRow,
} from './importCsv';

const PREVIEW_ROWS = 5;
const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(LEAD_CSV_TEMPLATE)}`;

const readFileText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

/** CRM-9: choose a CSV, preview the first rows, import, then read the report. */
export function ImportLeads({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setError('');
    setReport(null);
    setRows([]);
    setFileName('');
    if (!file) return;
    try {
      const result = parseLeadsCsv(await readFileText(file));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFileName(file.name);
      setRows(result.rows);
    } catch {
      setError('Could not read that file. Please choose a .csv file.');
    }
  }

  async function runImport() {
    setImporting(true);
    setError('');
    const total: ImportReport = {
      received: 0,
      imported: 0,
      duplicates: 0,
      rejected: 0,
      errors: [],
    };
    try {
      for (let start = 0; start < rows.length; start += BATCH_SIZE) {
        const result = await api<ImportReport>('/leads/import', {
          method: 'POST',
          body: JSON.stringify({ rows: rows.slice(start, start + BATCH_SIZE) }),
        });
        total.received += result.received;
        total.imported += result.imported;
        total.duplicates += result.duplicates;
        total.rejected += result.rejected;
        // The server numbers rows from 1 inside each batch; make them file-wide.
        total.errors.push(...result.errors.map((er) => ({ ...er, row: er.row + start })));
      }
    } catch (err) {
      const reason = err instanceof ApiError ? err.message : 'The server could not be reached.';
      setError(
        `Stopped after ${total.received} of ${rows.length} rows: ${reason} Rows already imported were saved, so do not import the whole file again.`,
      );
    } finally {
      setRows([]);
      setReport(total);
      setImporting(false);
      await queryClient.invalidateQueries({ queryKey: ['leads'] });
    }
  }

  const preview = rows.slice(0, PREVIEW_ROWS);

  return (
    <section
      aria-label="Import leads"
      className="mt-4 max-w-3xl rounded border border-slate-200 bg-white p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Import leads from CSV</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-slate-300 px-3 py-1 text-sm"
        >
          Close
        </button>
      </div>

      <p className="mt-2 text-sm text-slate-600">
        The first row must name the columns: <strong>name</strong> and <strong>email</strong> are
        required, <strong>phone</strong> and <strong>company</strong> are optional. Up to 1,000
        rows. A lead whose email already exists is saved and flagged as a duplicate.{' '}
        <a
          href={templateHref}
          download="leads-template.csv"
          className="font-medium text-blue-800 underline"
        >
          Download template
        </a>
      </p>

      <label className="mt-3 block text-sm">
        CSV file
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={onFile}
          disabled={importing}
          className="mt-1 block w-full text-sm"
        />
      </label>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {rows.length > 0 && (
        <div className="mt-4">
          <p className="text-sm text-slate-700">
            Previewing the first {preview.length} of {rows.length} rows from {fileName}
          </p>
          <div className="mt-2 overflow-x-auto rounded border border-slate-200">
            <table aria-label="Preview" className="w-full min-w-[480px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Phone</th>
                  <th className="px-3 py-2 font-medium">Company</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2">{r.email}</td>
                    <td className="px-3 py-2">{r.phone ?? ''}</td>
                    <td className="px-3 py-2">{r.company ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() => void runImport()}
            disabled={importing}
            className="mt-3 rounded bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {importing ? 'Importing…' : `Import ${rows.length} leads`}
          </button>
        </div>
      )}

      {report && report.received > 0 && (
        <div role="status" className="mt-4 text-sm text-slate-800">
          <h3 className="font-semibold text-slate-900">Import report</h3>
          <p className="mt-1">
            Imported <strong data-testid="report-imported">{report.imported}</strong> of{' '}
            {report.received} rows.
          </p>
          <p>
            Flagged as duplicates:{' '}
            <strong data-testid="report-duplicates">{report.duplicates}</strong>
          </p>
          <p>
            Rejected: <strong data-testid="report-rejected">{report.rejected}</strong>
          </p>
          {report.errors.length > 0 && (
            <div className="mt-2 overflow-x-auto rounded border border-slate-200">
              <table aria-label="Rejected rows" className="w-full min-w-[480px] text-left">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">Row</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {report.errors.map((er) => (
                    <tr key={er.row} className="border-t border-slate-100">
                      <td className="px-3 py-2">{er.row}</td>
                      <td className="px-3 py-2">{er.email ?? ''}</td>
                      <td className="px-3 py-2 text-red-700">{er.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Row 1 is the first lead under the header row.
          </p>
        </div>
      )}
    </section>
  );
}
