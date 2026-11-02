import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { ActivitiesPanel } from '../../components/activities/ActivitiesPanel';
import {
  formatDate,
  formatDateTime,
  formatRupees,
  KIND_BADGE_LABEL,
  KIND_FILTER_LABEL,
  KIND_STYLE,
  TIER_LABEL,
  TIER_STYLE,
  TIMELINE_KINDS,
  type Customer360,
  type TimelineKind,
} from './types';

function errorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 403) {
    return 'You do not have access to Customer 360.';
  }
  if (error instanceof ApiError && error.status === 404) return 'Customer not found.';
  return 'Could not load this customer.';
}

/** CRM-22 / CRM-F-041: profile, account, deals, orders, tickets, activities, points and campaign touches on one timeline. */
export function Customer360Page() {
  const { id = '' } = useParams();
  const [kind, setKind] = useState<TimelineKind | 'ALL'>('ALL');

  const data = useQuery({
    // Starts with "activities", so logging an activity in the panel below refreshes this too.
    queryKey: ['activities', 'customer360', id],
    queryFn: () => api<Customer360>(`/customers/${id}/360`),
    retry: false,
  });

  const customer = data.data;
  const items = customer?.timeline.filter((i) => kind === 'ALL' || i.kind === kind) ?? [];

  return (
    <div>
      <Link to="/customers" className="text-sm text-blue-800 underline">
        ← All customers
      </Link>

      {data.isLoading && <p className="mt-4 text-sm text-slate-500">Loading…</p>}
      {data.isError && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {errorMessage(data.error)}
        </p>
      )}

      {customer && (
        <>
          <section
            aria-label="Profile"
            className="mt-4 rounded border border-slate-200 bg-white p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-900">{customer.profile.name}</h1>
              <span className={`rounded px-2 py-0.5 text-xs ${TIER_STYLE[customer.profile.tier]}`}>
                {TIER_LABEL[customer.profile.tier]}
              </span>
              {customer.profile.isChurnRisk && (
                <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                  Churn risk
                </span>
              )}
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-slate-500">Email</dt>
                <dd className="text-slate-900">{customer.profile.email}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Phone</dt>
                <dd className="text-slate-900">{customer.profile.phone ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">City</dt>
                <dd className="text-slate-900">{customer.profile.city ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Account</dt>
                <dd className="text-slate-900">{customer.profile.account?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Owner</dt>
                <dd className="text-slate-900">{customer.profile.ownerName ?? 'Unassigned'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Customer since</dt>
                <dd className="text-slate-900">{formatDate(customer.profile.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Referral code</dt>
                <dd className="text-slate-900">{customer.profile.referralCode}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Marketing consent</dt>
                <dd className="text-slate-900">
                  {customer.profile.marketingConsent ? 'Yes' : 'No'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Tags</dt>
                <dd className="text-slate-900">
                  {customer.profile.tags.length > 0 ? customer.profile.tags.join(', ') : '—'}
                </dd>
              </div>
            </dl>
          </section>

          <section aria-label="Summary" className="mt-4">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {[
                ['Points balance', String(customer.profile.pointsBalance)],
                ['Total spent', formatRupees(customer.summary.totalSpent)],
                ['Deals', String(customer.summary.deals)],
                ['Orders', String(customer.summary.orders)],
                ['Open tickets', `${customer.summary.openTickets} of ${customer.summary.tickets}`],
                ['Activities', String(customer.summary.activities)],
                ['Campaign touches', String(customer.summary.campaignTouches)],
              ].map(([label, value]) => (
                <div key={label} className="rounded border border-slate-200 bg-white p-3">
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="mt-1 text-lg font-semibold text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-label="Timeline section" className="mt-6">
            <h2 className="text-lg font-semibold text-slate-900">Timeline</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {(['ALL', ...TIMELINE_KINDS] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => setKind(k)}
                  className={`rounded border px-3 py-1 text-sm ${
                    kind === k
                      ? 'border-blue-700 bg-blue-700 text-white'
                      : 'border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  {k === 'ALL' ? 'All' : KIND_FILTER_LABEL[k]}
                </button>
              ))}
            </div>

            {customer.timeline.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No activity yet for this customer.</p>
            ) : items.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Nothing in this category yet.</p>
            ) : (
              <ol aria-label="Timeline" className="mt-3 rounded border border-slate-200 bg-white">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-start gap-3 border-t border-slate-100 px-3 py-3 first:border-t-0"
                  >
                    <span
                      className={`mt-0.5 rounded px-2 py-0.5 text-xs font-medium ${KIND_STYLE[item.kind]}`}
                    >
                      {KIND_BADGE_LABEL[item.kind]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">{item.title}</p>
                      {item.detail && <p className="text-sm text-slate-600">{item.detail}</p>}
                    </div>
                    <div className="text-right text-sm text-slate-600">
                      {item.amount !== null && (
                        <p className="font-medium text-slate-900">{formatRupees(item.amount)}</p>
                      )}
                      <time dateTime={item.at}>{formatDateTime(item.at)}</time>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {customer.truncated && (
              <p className="mt-2 text-xs text-slate-500">
                Showing the most recent items only. Older history is not listed here.
              </p>
            )}
          </section>

          <section aria-label="Log an activity" className="mt-6">
            <h2 className="text-lg font-semibold text-slate-900">Log an activity</h2>
            <ActivitiesPanel link={{ contactId: id }} />
          </section>
        </>
      )}
    </div>
  );
}
