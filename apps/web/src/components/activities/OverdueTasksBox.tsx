import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { formatDue, type ActivitiesPage } from './types';

/** Dashboard box: how many of my activities are overdue, and the first few. */
export function OverdueTasksBox() {
  const overdue = useQuery({
    queryKey: ['activities', 'overdue-mine'],
    queryFn: () => api<ActivitiesPage>('/activities?mine=true&overdue=true&pageSize=5'),
  });
  const items = overdue.data?.data ?? [];
  const total = overdue.data?.total ?? 0;

  return (
    <section
      aria-label="My overdue tasks"
      className="mt-4 max-w-xl rounded border border-slate-200 bg-white p-4 text-sm"
    >
      <h2 className="font-medium text-slate-900">
        My overdue tasks{' '}
        <span
          data-testid="overdue-count"
          className="ml-1 rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800"
        >
          {total}
        </span>
      </h2>
      {overdue.isError && (
        <p role="alert" className="mt-2 text-red-700">
          Could not load overdue tasks.
        </p>
      )}
      {overdue.data && total === 0 && <p className="mt-2 text-slate-600">No overdue tasks.</p>}
      <ul className="mt-2 grid gap-1">
        {items.map((a) => (
          <li key={a.id} className="flex flex-wrap gap-x-2 text-slate-800">
            <span className="font-medium">{a.subject}</span>
            {a.linkLabel && <span className="text-slate-600">({a.linkLabel})</span>}
            {a.dueAt && <span className="text-red-800">due {formatDue(a.dueAt)}</span>}
          </li>
        ))}
      </ul>
      {total > items.length && (
        <p className="mt-2 text-slate-600">and {total - items.length} more</p>
      )}
    </section>
  );
}
