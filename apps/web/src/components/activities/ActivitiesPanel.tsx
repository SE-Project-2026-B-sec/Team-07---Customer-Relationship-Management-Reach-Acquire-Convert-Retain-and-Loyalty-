import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import {
  ACTIVITY_LABEL,
  ACTIVITY_TYPES,
  formatDue,
  type Activity,
  type ActivitiesPage,
  type ActivityLink,
  type ActivityType,
} from './types';

/**
 * Lists the activities on one deal, contact or lead and lets the user log a new one.
 * Usage: <ActivitiesPanel link={{ dealId }} />  (Disha can use { contactId } on the contact page)
 */
export function ActivitiesPanel({ link }: { link: ActivityLink }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<ActivityType>('TASK');
  const [subject, setSubject] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const params = new URLSearchParams({ ...link, pageSize: '100' });
  const activities = useQuery({
    queryKey: ['activities', 'list', link],
    queryFn: () => api<ActivitiesPage>(`/activities?${params.toString()}`),
  });

  // Refreshes this panel and the Dashboard's overdue box.
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['activities'] });

  const add = useMutation({
    mutationFn: () =>
      api<Activity>('/activities', {
        method: 'POST',
        body: JSON.stringify({
          type,
          subject: subject.trim(),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          // The date box gives local time; send it as an exact moment.
          ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}),
          ...link,
        }),
      }),
    onSuccess: async () => {
      setSubject('');
      setNotes('');
      setDueAt('');
      setType('TASK');
      setError('');
      await refresh();
    },
    onError: () => setError('Could not save the activity. Please try again.'),
  });

  const markDone = useMutation({
    mutationFn: (id: string) =>
      api<Activity>(`/activities/${id}`, { method: 'PATCH', body: JSON.stringify({ done: true }) }),
    onSuccess: async () => {
      setError('');
      await refresh();
    },
    onError: () => setError('Could not mark it done. Please try again.'),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    add.mutate();
  }

  const items = activities.data?.data ?? [];

  return (
    <div>
      <h3 className="text-base font-semibold text-slate-900">Activities</h3>

      {activities.isLoading && <p className="mt-2 text-sm text-slate-600">Loading activities…</p>}
      {activities.isError && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          Could not load activities.
        </p>
      )}
      {activities.data && items.length === 0 && (
        <p className="mt-2 text-sm text-slate-600">No activities yet.</p>
      )}

      <ul className="mt-3 grid gap-2">
        {items.map((a) => (
          <li key={a.id} className="rounded border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                {ACTIVITY_LABEL[a.type]}
              </span>
              <span
                className={
                  a.done
                    ? 'text-sm text-slate-500 line-through'
                    : 'text-sm font-medium text-slate-900'
                }
              >
                {a.subject}
              </span>
              {a.overdue && (
                <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                  Overdue
                </span>
              )}
              {a.done && <span className="text-xs font-medium text-green-800">Done</span>}
            </div>
            {a.dueAt && <p className="mt-1 text-xs text-slate-600">Due {formatDue(a.dueAt)}</p>}
            {a.notes && <p className="mt-1 text-sm text-slate-700">{a.notes}</p>}
            <p className="mt-1 text-xs text-slate-500">Logged by {a.userName}</p>
            {!a.done && (
              <button
                type="button"
                aria-label={`Mark ${a.subject} as done`}
                disabled={markDone.isPending}
                onClick={() => markDone.mutate(a.id)}
                className="mt-2 rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
              >
                Mark done
              </button>
            )}
          </li>
        ))}
      </ul>

      <form
        onSubmit={onSubmit}
        aria-label="Add activity"
        className="mt-4 grid max-w-xl gap-3 rounded border border-slate-200 bg-white p-4"
      >
        <h4 className="text-sm font-semibold text-slate-900">Add activity</h4>
        <label className="text-sm">
          Type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ActivityType)}
            className="mt-1 w-full rounded border px-3 py-2"
          >
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACTIVITY_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Subject
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            maxLength={200}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Due (optional)
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Notes (optional)
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            rows={2}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div>
          <button
            type="submit"
            disabled={add.isPending}
            className="rounded bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {add.isPending ? 'Saving…' : 'Add activity'}
          </button>
        </div>
      </form>
    </div>
  );
}
