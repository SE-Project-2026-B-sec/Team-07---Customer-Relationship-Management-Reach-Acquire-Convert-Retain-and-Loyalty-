import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, api } from '../../api/client';

/**
 * Loyalty (CRM-24 orders and points, CRM-25 tiers, CRM-26 rewards).
 * Pick a customer, record an order (1 point per Rs 100), see their balance and tier,
 * and redeem a reward. Tiers and the reward catalogue are listed below.
 */

type Tier = { name: string; minPoints: number };
type Reward = { id: string; name: string; pointsCost: number; stock: number; isActive: boolean };
type ContactLite = { id: string; name: string; email: string };
type Points = {
  contactId: string;
  name: string;
  tier: string;
  balance: number;
  ledger: { id: string; delta: number; reason: string; balanceAfter: number; createdAt: string }[];
};

const message = (err: unknown) =>
  err instanceof ApiError && err.code === 'INSUFFICIENT_POINTS'
    ? 'Not enough points for this reward.'
    : err instanceof Error
      ? err.message
      : 'Something went wrong.';

export function LoyaltyPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [customer, setCustomer] = useState<ContactLite | null>(null);
  const [amount, setAmount] = useState('');
  const [rewardId, setRewardId] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const tiers = useQuery({ queryKey: ['tiers'], queryFn: () => api<Tier[]>('/tiers') });
  const rewards = useQuery({ queryKey: ['rewards'], queryFn: () => api<Reward[]>('/rewards') });
  const matches = useQuery({
    queryKey: ['loyalty-search', q],
    queryFn: () => api<{ items: ContactLite[] }>(`/contacts?pageSize=5&q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2,
  });
  const points = useQuery({
    queryKey: ['points', customer?.id],
    queryFn: () => api<Points>(`/customers/${customer?.id ?? ''}/points`),
    enabled: !!customer,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['points'] });
    queryClient.invalidateQueries({ queryKey: ['rewards'] });
  };

  const order = useMutation({
    mutationFn: () =>
      api<{ pointsEarned: number; balance: number; tier: string; tierChanged: boolean }>(
        '/orders',
        {
          method: 'POST',
          body: JSON.stringify({ contactId: customer?.id ?? '', amount: Number(amount) }),
        },
      ),
    onSuccess: (r) => {
      setError(null);
      setAmount('');
      setNotice(
        `Order recorded: +${r.pointsEarned} points, balance ${r.balance}` +
          (r.tierChanged ? ` — upgraded to ${r.tier}!` : ''),
      );
      refresh();
    },
    onError: (err) => setError(message(err)),
  });

  const redeem = useMutation({
    mutationFn: () =>
      api<{ pointsSpent: number; balance: number; reward: { name: string } }>(
        `/rewards/${rewardId}/redeem`,
        {
          method: 'POST',
          body: JSON.stringify({ contactId: customer?.id ?? '' }),
        },
      ),
    onSuccess: (r) => {
      setError(null);
      setNotice(`Redeemed ${r.reward.name} for ${r.pointsSpent} points. Balance ${r.balance}.`);
      refresh();
    },
    onError: (err) => setError(message(err)),
  });

  const onOrder = (e: FormEvent) => {
    e.preventDefault();
    setNotice(null);
    order.mutate();
  };
  const onRedeem = (e: FormEvent) => {
    e.preventDefault();
    setNotice(null);
    redeem.mutate();
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Loyalty</h1>

      <section className="mt-4 rounded border border-slate-200 bg-white p-4">
        <h2 className="font-medium text-slate-900">Customer</h2>
        {customer ? (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium">{customer.name}</span>
            <span className="text-slate-500">{customer.email}</span>
            <button
              type="button"
              onClick={() => {
                setCustomer(null);
                setNotice(null);
                setError(null);
              }}
              className="rounded border border-slate-300 px-2 py-0.5 text-xs"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="mt-2">
            <label className="text-sm">
              Find customer
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or email"
                className="mt-1 block w-72 max-w-full rounded border px-3 py-2"
              />
            </label>
            <ul className="mt-2 space-y-1">
              {(matches.data?.items ?? []).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setCustomer(c)}
                    className="text-left text-sm text-blue-700 underline"
                  >
                    {c.name} · {c.email}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {customer && points.data && (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Points balance</div>
              <div className="text-2xl font-semibold">{points.data.balance}</div>
              <div className="mt-1 text-sm">
                Tier: <span className="font-medium">{points.data.tier}</span>
              </div>
            </div>

            <form onSubmit={onOrder} aria-label="Record order" className="rounded bg-slate-50 p-3">
              <label className="text-sm">
                Order amount (Rs)
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1 block w-full rounded border px-3 py-2"
                />
              </label>
              <button
                type="submit"
                disabled={order.isPending}
                className="mt-2 rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Record order
              </button>
            </form>

            <form
              onSubmit={onRedeem}
              aria-label="Redeem reward"
              className="rounded bg-slate-50 p-3"
            >
              <label className="text-sm">
                Reward
                <select
                  required
                  value={rewardId}
                  onChange={(e) => setRewardId(e.target.value)}
                  className="mt-1 block w-full rounded border px-3 py-2"
                >
                  <option value="">Choose…</option>
                  {(rewards.data ?? [])
                    .filter((r) => r.isActive)
                    .map((r) => (
                      <option key={r.id} value={r.id} disabled={r.stock <= 0}>
                        {r.name} — {r.pointsCost} pts{r.stock <= 0 ? ' (out of stock)' : ''}
                      </option>
                    ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={redeem.isPending}
                className="mt-2 rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Redeem
              </button>
            </form>
          </div>
        )}

        {notice && (
          <p role="status" className="mt-3 text-sm text-green-700">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {customer && points.data && points.data.ledger.length > 0 && (
          <table className="mt-4 w-full text-left text-sm">
            <thead className="text-slate-600">
              <tr>
                <th className="py-1 font-medium">When</th>
                <th className="py-1 font-medium">Reason</th>
                <th className="py-1 font-medium">Points</th>
                <th className="py-1 font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {points.data.ledger.slice(0, 10).map((l) => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="py-1">{new Date(l.createdAt).toLocaleString()}</td>
                  <td className="py-1">{l.reason}</td>
                  <td className={`py-1 ${l.delta < 0 ? 'text-red-700' : 'text-green-700'}`}>
                    {l.delta > 0 ? `+${l.delta}` : l.delta}
                  </td>
                  <td className="py-1">{l.balanceAfter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="rounded border border-slate-200 bg-white p-4">
          <h2 className="font-medium text-slate-900">Tiers</h2>
          <ul className="mt-2 text-sm">
            {(tiers.data ?? []).map((t) => (
              <li key={t.name} className="flex justify-between border-t border-slate-100 py-1">
                <span>{t.name}</span>
                <span className="text-slate-600">from {t.minPoints} pts</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            1 point per Rs 100. Tiers use lifetime points.
          </p>
        </section>

        <section className="rounded border border-slate-200 bg-white p-4">
          <h2 className="font-medium text-slate-900">Reward catalogue</h2>
          <ul className="mt-2 text-sm">
            {(rewards.data ?? []).map((r) => (
              <li key={r.id} className="flex justify-between border-t border-slate-100 py-1">
                <span className={r.isActive ? '' : 'text-slate-400 line-through'}>{r.name}</span>
                <span className="text-slate-600">
                  {r.pointsCost} pts · {r.stock} left
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
