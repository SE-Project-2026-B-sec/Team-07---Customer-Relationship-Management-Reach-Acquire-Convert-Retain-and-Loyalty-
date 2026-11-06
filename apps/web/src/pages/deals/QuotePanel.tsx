import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, apiDownload, ApiError } from '../../api/client';
import { formatInrExact, quoteTotals, type Deal, type Quote } from './types';

interface Row {
  description: string;
  quantity: string;
  unitPrice: string;
}

const emptyRow = (): Row => ({ description: '', quantity: '1', unitPrice: '' });

const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';

/** CRM-30 / CRM-F-034: build a quote for a deal (items, discount, total) and download it as PDF. */
export function QuotePanel({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  const queryClient = useQueryClient();
  const key = ['quotes', deal.id];
  const quotes = useQuery({
    queryKey: key,
    queryFn: () => api<Quote[]>(`/deals/${deal.id}/quotes`),
  });

  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [discount, setDiscount] = useState('0');
  const [downloadError, setDownloadError] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);

  const items = rows.map((r) => ({
    description: r.description.trim(),
    quantity: Number(r.quantity) || 0,
    unitPrice: Number(r.unitPrice) || 0,
  }));
  const discountPct = Math.min(Math.max(Number(discount) || 0, 0), 100);
  const totals = quoteTotals(items, discountPct);

  const save = useMutation({
    mutationFn: () =>
      api<Quote>(`/deals/${deal.id}/quotes`, {
        method: 'POST',
        body: JSON.stringify({ items, discountPct }),
      }),
    onSuccess: async () => {
      setRows([emptyRow()]);
      setDiscount('0');
      await queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((old) => old.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  async function download(q: Quote) {
    setDownloadError('');
    setDownloading(q.id);
    try {
      await apiDownload(`/quotes/${q.id}/pdf`, `${q.number}.pdf`);
    } catch (err) {
      setDownloadError(errorText(err));
    } finally {
      setDownloading(null);
    }
  }

  return (
    <section
      aria-label={`Quotes for ${deal.title}`}
      className="mt-4 rounded border border-slate-200 bg-slate-50 p-4 text-sm"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Quotes: {deal.title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-slate-300 px-3 py-1 text-sm"
        >
          Close
        </button>
      </div>

      {quotes.isError && (
        <p role="alert" className="text-red-700">
          {errorText(quotes.error)}
        </p>
      )}
      {quotes.data && quotes.data.length > 0 && (
        <div className="relative mb-4 overflow-x-auto rounded border border-slate-200 bg-white">
          <table className="w-full min-w-[480px] text-left">
            <caption className="sr-only">Saved quotes</caption>
            <thead className="bg-slate-100 text-xs text-slate-700">
              <tr>
                <th className="px-3 py-2">Quote</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2">PDF</th>
              </tr>
            </thead>
            <tbody>
              {quotes.data.map((q) => (
                <tr key={q.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono text-xs">{q.number}</td>
                  <td className="px-3 py-2">
                    {new Date(q.createdAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{formatInrExact(q.total)}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => download(q)}
                      disabled={downloading === q.id}
                      aria-label={`Download ${q.number} as PDF`}
                      className="rounded border border-slate-300 px-3 py-1 text-xs disabled:opacity-50"
                    >
                      {downloading === q.id ? 'Downloading…' : 'Download PDF'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {downloadError && (
        <p role="alert" className="mb-3 text-red-700">
          {downloadError}
        </p>
      )}

      <form onSubmit={submit} aria-label="New quote" className="rounded border bg-white p-3">
        <h3 className="font-semibold text-slate-900">New quote</h3>
        <div className="mt-2 space-y-2">
          {rows.map((row, i) => (
            <fieldset key={i} className="flex flex-wrap items-end gap-2">
              <legend className="sr-only">Item {i + 1}</legend>
              <label className="min-w-[12rem] flex-1">
                <span className="text-xs text-slate-600">Item {i + 1} description</span>
                <input
                  required
                  maxLength={200}
                  value={row.description}
                  onChange={(e) => setRow(i, { description: e.target.value })}
                  className="mt-1 block w-full rounded border px-2 py-1"
                />
              </label>
              <label className="w-20">
                <span className="text-xs text-slate-600">Qty</span>
                <input
                  required
                  type="number"
                  min={1}
                  step={1}
                  value={row.quantity}
                  onChange={(e) => setRow(i, { quantity: e.target.value })}
                  className="mt-1 block w-full rounded border px-2 py-1"
                />
              </label>
              <label className="w-32">
                <span className="text-xs text-slate-600">Unit price (₹)</span>
                <input
                  required
                  type="number"
                  min={0}
                  step={0.01}
                  value={row.unitPrice}
                  onChange={(e) => setRow(i, { unitPrice: e.target.value })}
                  className="mt-1 block w-full rounded border px-2 py-1"
                />
              </label>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => setRows((old) => old.filter((_, j) => j !== i))}
                  aria-label={`Remove item ${i + 1}`}
                  className="rounded border border-slate-300 px-2 py-1 text-xs"
                >
                  Remove
                </button>
              )}
            </fieldset>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setRows((old) => [...old, emptyRow()])}
          disabled={rows.length >= 50}
          className="mt-2 text-xs font-medium text-blue-800 underline disabled:opacity-50"
        >
          + Add item
        </button>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <label className="w-28">
            <span className="text-xs text-slate-600">Discount (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className="mt-1 block w-full rounded border px-2 py-1"
            />
          </label>
          <dl aria-label="Quote totals" className="min-w-[14rem] text-right">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-600">Subtotal</dt>
              <dd>{formatInrExact(totals.subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-600">Discount ({discountPct}%)</dt>
              <dd>− {formatInrExact(totals.discount)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t pt-1 font-semibold">
              <dt>Total</dt>
              <dd>{formatInrExact(totals.total)}</dd>
            </div>
          </dl>
        </div>

        {save.isError && (
          <p role="alert" className="mt-2 text-red-700">
            {errorText(save.error)}
          </p>
        )}
        <button
          type="submit"
          disabled={save.isPending}
          className="mt-3 rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
        >
          {save.isPending ? 'Saving…' : 'Save quote'}
        </button>
      </form>
    </section>
  );
}
