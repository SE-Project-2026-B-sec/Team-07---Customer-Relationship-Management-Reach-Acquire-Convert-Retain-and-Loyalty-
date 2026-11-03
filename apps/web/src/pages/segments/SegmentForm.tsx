import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import {
  splitList,
  TIER_LABEL,
  TIERS,
  type Preview,
  type Segment,
  type SegmentFilter,
  type Tier,
} from './types';

type OrderRule = 'any' | 'within' | 'none';

/** CRM-17: create or edit a segment, with a live count of who it would reach. */
export function SegmentForm({ segment, onClose }: { segment?: Segment; onClose: () => void }) {
  const queryClient = useQueryClient();
  const f = segment?.filter ?? {};
  const [name, setName] = useState(segment?.name ?? '');
  const [cities, setCities] = useState((f.cities ?? []).join(', '));
  const [tags, setTags] = useState((f.tags ?? []).join(', '));
  const [tiers, setTiers] = useState<Tier[]>(f.tiers ?? []);
  const [orderRule, setOrderRule] = useState<OrderRule>(
    f.orderedWithinDays ? 'within' : f.noOrderForDays ? 'none' : 'any',
  );
  const [days, setDays] = useState(String(f.orderedWithinDays ?? f.noOrderForDays ?? 90));
  const [error, setError] = useState('');

  const filter: SegmentFilter = {
    ...(splitList(cities).length ? { cities: splitList(cities) } : {}),
    ...(tiers.length ? { tiers } : {}),
    ...(splitList(tags).length ? { tags: splitList(tags) } : {}),
    ...(orderRule === 'within' && Number(days) > 0 ? { orderedWithinDays: Number(days) } : {}),
    ...(orderRule === 'none' && Number(days) > 0 ? { noOrderForDays: Number(days) } : {}),
  };
  const filterKey = JSON.stringify(filter);

  // Wait until the user stops typing before asking the server for a new count.
  const [debouncedKey, setDebouncedKey] = useState(filterKey);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedKey(filterKey), 400);
    return () => clearTimeout(t);
  }, [filterKey]);

  const preview = useQuery({
    queryKey: ['segment-preview', debouncedKey],
    queryFn: () =>
      api<Preview>('/segments/preview', {
        method: 'POST',
        body: JSON.stringify({ filter: JSON.parse(debouncedKey) }),
      }),
  });

  const save = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({ name: name.trim(), filter });
      return segment
        ? api<Segment>(`/segments/${segment.id}`, { method: 'PATCH', body })
        : api<Segment>('/segments', { method: 'POST', body });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['segments'] });
      onClose();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Could not save the segment. Try again.'),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    save.mutate();
  }

  const toggleTier = (t: Tier) =>
    setTiers((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const input = 'mt-1 w-full rounded border px-3 py-2';
  return (
    <form
      onSubmit={onSubmit}
      aria-label={segment ? 'Edit segment' : 'New segment'}
      className="mt-4 grid gap-4 rounded border border-slate-200 bg-white p-4 lg:grid-cols-[1fr_18rem]"
    >
      <div className="grid gap-3">
        <h2 className="text-lg font-semibold text-slate-900">
          {segment ? 'Edit segment' : 'New segment'}
        </h2>
        <label className="text-sm">
          Segment name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            placeholder="e.g. Gold customers in Bengaluru"
            className={input}
          />
        </label>
        <label className="text-sm">
          Cities (optional, separate with commas)
          <input
            value={cities}
            onChange={(e) => setCities(e.target.value)}
            placeholder="Bengaluru, Mumbai"
            className={input}
          />
        </label>
        <fieldset className="text-sm">
          <legend>Loyalty tier (optional)</legend>
          <div className="mt-1 flex flex-wrap gap-3">
            {TIERS.map((t) => (
              <label key={t} className="flex items-center gap-1">
                <input type="checkbox" checked={tiers.includes(t)} onChange={() => toggleTier(t)} />
                {TIER_LABEL[t]}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="text-sm">
          Tags (optional, any of these, separate with commas)
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="vip"
            className={input}
          />
        </label>
        <fieldset className="text-sm">
          <legend>Orders</legend>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {(
              [
                ['any', 'Any'],
                ['within', 'Ordered in the last'],
                ['none', 'No order for'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-1">
                <input
                  type="radio"
                  name="orderRule"
                  checked={orderRule === value}
                  onChange={() => setOrderRule(value)}
                />
                {label}
              </label>
            ))}
            {orderRule !== 'any' && (
              <label className="flex items-center gap-1">
                <input
                  type="number"
                  min="1"
                  max="3650"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  aria-label="Number of days"
                  className="w-20 rounded border px-2 py-1"
                />
                days
              </label>
            )}
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={save.isPending}
            className="rounded bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {save.isPending ? 'Saving…' : 'Save segment'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-4 py-2 text-sm"
          >
            Cancel
          </button>
        </div>
      </div>

      <aside aria-label="Audience preview" className="rounded bg-slate-50 p-3 text-sm">
        <p className="text-slate-600">This segment reaches</p>
        <p className="text-3xl font-semibold text-slate-900" aria-live="polite">
          {preview.data ? preview.data.audienceSize.toLocaleString('en-IN') : '…'}
          <span className="ml-1 text-base font-normal text-slate-600">contacts</span>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Contacts who have not agreed to marketing are always left out.
        </p>
        {preview.isError && (
          <p role="alert" className="mt-2 text-red-700">
            Could not count the audience. Check the rules.
          </p>
        )}
        {preview.data && preview.data.sample.length > 0 && (
          <ul className="mt-3 space-y-1 text-slate-700">
            {preview.data.sample.map((c) => (
              <li key={c.id} className="truncate">
                {c.name}
                {c.city && <span className="text-slate-500"> · {c.city}</span>}
              </li>
            ))}
            {preview.data.audienceSize > preview.data.sample.length && (
              <li className="text-slate-500">
                and {preview.data.audienceSize - preview.data.sample.length} more
              </li>
            )}
          </ul>
        )}
      </aside>
    </form>
  );
}
