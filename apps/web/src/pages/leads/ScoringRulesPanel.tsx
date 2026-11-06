import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { LEAD_SOURCES, LEAD_STATUSES, SOURCE_LABEL, STATUS_LABEL } from './types';
import {
  defaultMatch,
  FIELD_LABEL,
  SCORE_FIELDS,
  type RuleMatch,
  type ScoreField,
  type ScoreRule,
} from './scoring';

/** CRM-20: Admin and Sales Manager edit the scoring rules; saving re-scores every lead. */
export function ScoringRulesPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [rules, setRules] = useState<ScoreRule[] | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loaded = useQuery({
    queryKey: ['lead-scoring-rules'],
    queryFn: () => api<{ rules: ScoreRule[] }>('/lead-scoring/rules'),
  });
  useEffect(() => {
    if (loaded.data && rules === null) setRules(loaded.data.rules);
  }, [loaded.data, rules]);

  const save = useMutation({
    mutationFn: (next: ScoreRule[]) =>
      api<{ rules: ScoreRule[]; rescored: number }>('/lead-scoring/rules', {
        method: 'PUT',
        body: JSON.stringify({ rules: next }),
      }),
    onSuccess: async (res) => {
      setRules(res.rules);
      setMessage(`Saved. ${res.rescored} lead${res.rescored === 1 ? '' : 's'} got a new score.`);
      await queryClient.invalidateQueries({ queryKey: ['leads'] });
      await queryClient.invalidateQueries({ queryKey: ['lead-scoring-rules'] });
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Could not save the rules. Try again.'),
  });

  const update = (i: number, change: Partial<ScoreRule>) =>
    setRules((cur) => cur!.map((r, j) => (j === i ? { ...r, ...change } : r)));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    setError('');
    save.mutate(rules ?? []);
  }

  const total = (rules ?? [])
    .filter((r) => r.isActive && r.points > 0)
    .reduce((s, r) => s + r.points, 0);

  return (
    <form
      onSubmit={onSubmit}
      aria-label="Scoring rules"
      className="mt-4 rounded border border-slate-200 bg-white p-4"
    >
      <h2 className="text-lg font-semibold text-slate-900">Lead scoring rules</h2>
      <p className="mt-1 text-sm text-slate-600">
        A lead's score is the total points of every rule it matches, from 0 to 100. Saving re-scores
        all leads.
      </p>

      {loaded.isLoading && <p className="mt-3 text-sm text-slate-500">Loading…</p>}

      {rules && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-slate-600">
              <tr>
                <th className="py-1 pr-2 font-medium">When the lead…</th>
                <th className="py-1 pr-2 font-medium">Value</th>
                <th className="py-1 pr-2 font-medium">Points</th>
                <th className="py-1 pr-2 font-medium">On</th>
                <th className="py-1">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-1 pr-2">
                    <select
                      aria-label={`Rule ${i + 1} condition`}
                      value={rule.field}
                      onChange={(e) => {
                        const field = e.target.value as ScoreField;
                        update(i, { field, match: defaultMatch(field) });
                      }}
                      className="w-full rounded border px-2 py-1"
                    >
                      {SCORE_FIELDS.map((f) => (
                        <option key={f} value={f}>
                          {FIELD_LABEL[f]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <MatchInput
                      index={i}
                      field={rule.field}
                      match={rule.match}
                      onChange={(match) => update(i, { match })}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      type="number"
                      min="-100"
                      max="100"
                      aria-label={`Rule ${i + 1} points`}
                      value={rule.points}
                      onChange={(e) => update(i, { points: Number(e.target.value) })}
                      className="w-20 rounded border px-2 py-1"
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      type="checkbox"
                      aria-label={`Rule ${i + 1} on`}
                      checked={rule.isActive}
                      onChange={(e) => update(i, { isActive: e.target.checked })}
                    />
                  </td>
                  <td className="py-1 text-right">
                    <button
                      type="button"
                      aria-label={`Remove rule ${i + 1}`}
                      onClick={() => setRules((cur) => cur!.filter((_, j) => j !== i))}
                      className="rounded px-2 text-slate-500 hover:bg-slate-100"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            onClick={() =>
              setRules((cur) => [
                ...(cur ?? []),
                { field: 'source', match: defaultMatch('source'), points: 10, isActive: true },
              ])
            }
            className="mt-2 text-sm font-medium text-blue-800 underline"
          >
            Add rule
          </button>
          <p className="mt-2 text-xs text-slate-500">
            A lead matching every positive rule would score {Math.min(100, total)}
            {total > 100 ? ` (capped from ${total})` : ''}.
          </p>
        </div>
      )}

      {message && (
        <p role="status" className="mt-3 text-sm text-green-800">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={!rules || save.isPending}
          className="rounded bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {save.isPending ? 'Saving…' : 'Save and re-score'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-slate-300 px-4 py-2 text-sm"
        >
          Close
        </button>
      </div>
    </form>
  );
}

function MatchInput({
  index,
  field,
  match,
  onChange,
}: {
  index: number;
  field: ScoreField;
  match: RuleMatch;
  onChange: (m: RuleMatch) => void;
}) {
  const label = `Rule ${index + 1} value`;
  if (field === 'source' || field === 'status') {
    const options =
      field === 'source'
        ? LEAD_SOURCES.map((s) => [s, SOURCE_LABEL[s]] as const)
        : LEAD_STATUSES.map((s) => [s, STATUS_LABEL[s]] as const);
    return (
      <select
        aria-label={label}
        value={'equals' in match ? match.equals : ''}
        onChange={(e) => onChange({ equals: e.target.value })}
        className="w-full rounded border px-2 py-1"
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    );
  }
  if (field === 'activities') {
    return (
      <input
        type="number"
        min="1"
        max="100"
        aria-label={label}
        value={'min' in match ? match.min : 1}
        onChange={(e) => onChange({ min: Math.max(1, Number(e.target.value)) })}
        className="w-20 rounded border px-2 py-1"
      />
    );
  }
  return <span className="text-slate-500">yes</span>;
}
