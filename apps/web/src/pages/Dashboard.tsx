import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { OverdueTasksBox } from '../components/activities/OverdueTasksBox';

interface Health {
  status: string;
  db: string;
}

export function Dashboard() {
  const health = useQuery({ queryKey: ['health'], queryFn: () => api<Health>('/health') });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
      <p className="mt-2 text-sm text-slate-600">
        KPI cards and the funnel arrive in Sprint 2 (CRM-28, CRM-29).
      </p>
      <div className="mt-6 inline-flex items-center gap-2 rounded border border-slate-200 bg-white px-4 py-3 text-sm">
        <span className="font-medium">API status:</span>
        {health.isLoading && <span>checking...</span>}
        {health.isError && <span className="text-red-700">not reachable</span>}
        {health.data && (
          <span className="text-green-700">
            {health.data.status} (database {health.data.db})
          </span>
        )}
      </div>
      <OverdueTasksBox />
    </div>
  );
}
