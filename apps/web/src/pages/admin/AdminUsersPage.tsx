import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';

/** CRM-6 (CRM-F-003): admins create users, change roles, and deactivate/reactivate them. */

const ROLES = ['ADMIN', 'MARKETING', 'SALES_MANAGER', 'SALES_REP', 'SUPPORT'] as const;
const label = (r: string) =>
  r
    .replace('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

type User = { id: string; name: string; email: string; role: string; isActive: boolean };

const EMPTY_FORM = { name: '', email: '', role: 'SALES_REP', password: '' };

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const users = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('/users') });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['users'] });
  const onError = (err: unknown) =>
    setError(err instanceof Error ? err.message : 'Something went wrong.');

  const create = useMutation({
    mutationFn: (body: typeof EMPTY_FORM) =>
      api<User>('/users', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      setForm(EMPTY_FORM);
      setShowForm(false);
      setError(null);
      refresh();
    },
    onError,
  });

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; role?: string; isActive?: boolean }) =>
      api<User>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError,
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(form);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Users</h1>
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white"
        >
          {showForm ? 'Cancel' : 'Add user'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={onSubmit}
          aria-label="New user"
          className="mt-4 grid gap-3 rounded border border-slate-200 bg-white p-4 sm:grid-cols-2"
        >
          <label className="text-sm">
            Name *
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 block w-full rounded border px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Email *
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="mt-1 block w-full rounded border px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Role
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="mt-1 block w-full rounded border px-3 py-2"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {label(r)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Temporary password * (8+ characters, a letter and a number)
            <input
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="mt-1 block w-full rounded border px-3 py-2"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {create.isPending ? 'Saving…' : 'Create user'}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="relative mt-4 overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.isLoading && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {users.isError && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-red-700">
                  Could not load users.
                </td>
              </tr>
            )}
            {(users.data ?? []).map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-900">{u.name}</td>
                <td className="px-3 py-2 text-slate-700">{u.email}</td>
                <td className="px-3 py-2">
                  <select
                    aria-label={`Role for ${u.name}`}
                    value={u.role}
                    onChange={(e) => update.mutate({ id: u.id, role: e.target.value })}
                    className="rounded border px-2 py-1"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {label(r)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${u.isActive ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-600'}`}
                  >
                    {u.isActive ? 'Active' : 'Deactivated'}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => update.mutate({ id: u.id, isActive: !u.isActive })}
                    className="rounded border border-slate-300 px-3 py-1 text-xs"
                  >
                    {u.isActive ? 'Deactivate' : 'Reactivate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
