import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { formatDate, type CustomerReferrals } from './types';

/**
 * CRM-27 / CRM-F-053: the customer's referral code, who referred them, and the customers they
 * referred. Each new customer who joins with the code earns this customer the bonus points.
 */
export function ReferralsSection({ contactId }: { contactId: string }) {
  const [copied, setCopied] = useState(false);
  const data = useQuery({
    // Starts with "activities" like the 360 query, so it refreshes along with the page.
    queryKey: ['activities', 'referrals', contactId],
    queryFn: () => api<CustomerReferrals>(`/customers/${contactId}/referrals`),
    retry: false,
  });

  // Hidden if it can't load: the rest of Customer 360 still works.
  const r = data.data;
  if (!r || !Array.isArray(r.referrals)) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(r!.referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not allowed (e.g. not https): the code is still visible to copy by hand.
    }
  }

  return (
    <section aria-label="Referrals" className="mt-6">
      <h2 className="text-lg font-semibold text-slate-900">Referrals</h2>
      <div className="mt-2 rounded border border-slate-200 bg-white p-4 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-slate-600">Referral code</span>
          <code className="rounded bg-slate-100 px-2 py-1 font-mono text-base text-slate-900">
            {r.referralCode}
          </code>
          <button
            type="button"
            onClick={copy}
            className="rounded border border-slate-300 px-3 py-1 text-xs"
          >
            {copied ? 'Copied' : 'Copy code'}
          </button>
        </div>
        <p className="mt-2 text-slate-600">
          Each new customer who joins with this code earns {r.bonusPerReferral} bonus points.
        </p>

        {r.referredBy && (
          <p className="mt-2 text-slate-700">
            Referred by{' '}
            <Link to={`/customers/${r.referredBy.id}`} className="text-blue-800 underline">
              {r.referredBy.name}
            </Link>{' '}
            on {formatDate(r.referredBy.referredAt)}
          </p>
        )}

        <dl className="mt-3 grid grid-cols-2 gap-3 sm:max-w-md">
          <div className="rounded border border-slate-200 p-3">
            <dt className="text-xs text-slate-500">Customers referred</dt>
            <dd className="mt-1 text-lg font-semibold text-slate-900">{r.referrals.length}</dd>
          </div>
          <div className="rounded border border-slate-200 p-3">
            <dt className="text-xs text-slate-500">Bonus points earned</dt>
            <dd className="mt-1 text-lg font-semibold text-slate-900">{r.bonusEarned}</dd>
          </div>
        </dl>

        {r.referrals.length === 0 ? (
          <p className="mt-3 text-slate-500">No one has joined with this code yet.</p>
        ) : (
          <ul aria-label="Customers referred" className="mt-3 divide-y divide-slate-100">
            {r.referrals.map((ref) => (
              <li key={ref.id} className="flex flex-wrap justify-between gap-2 py-2">
                <Link to={`/customers/${ref.customerId}`} className="text-blue-800 underline">
                  {ref.customerName}
                </Link>
                <span className="text-slate-600">
                  {formatDate(ref.referredAt)}
                  {ref.bonusAwarded && ` · +${r.bonusPerReferral} points`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
