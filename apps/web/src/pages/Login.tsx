/** Login screen. CRM-7 (Dhriti) wires this to POST /auth/login once CRM-4 (Balla) is merged. */
export function Login() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <form className="w-80 rounded border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-xl font-semibold">Sign in</h1>
        <label className="mb-3 block text-sm">
          Email
          <input type="email" name="email" className="mt-1 w-full rounded border px-3 py-2" />
        </label>
        <label className="mb-4 block text-sm">
          Password
          <input type="password" name="password" className="mt-1 w-full rounded border px-3 py-2" />
        </label>
        <button type="submit" className="w-full rounded bg-blue-700 py-2 text-white" disabled>
          Sign in
        </button>
      </form>
    </div>
  );
}
