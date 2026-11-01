import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';

/**
 * CRM-8 public website enquiry form (no login). Submits to POST /public/leads.
 * The hidden "website" field is a honeypot: people never see it, bots fill it in.
 */
export function EnquiryForm() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', website: '' });
  const [error, setError] = useState('');

  const set = (field: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = useMutation({
    mutationFn: () =>
      api('/public/leads', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          ...(form.phone ? { phone: form.phone } : {}),
          ...(form.company ? { company: form.company } : {}),
          ...(form.website ? { website: form.website } : {}),
        }),
      }),
    onError: (err) =>
      setError(
        err instanceof ApiError && err.status === 400
          ? 'Please check your details and try again.'
          : 'Something went wrong. Please try again in a minute.',
      ),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    submit.mutate();
  }

  const input = 'mt-1 w-full rounded border px-3 py-2';
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded border border-slate-200 bg-white p-6 shadow-sm">
        {submit.isSuccess ? (
          <div role="status">
            <h1 className="text-xl font-semibold text-slate-900">Thank you!</h1>
            <p className="mt-2 text-sm text-slate-600">
              We've received your enquiry and our team will contact you soon.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} aria-label="Enquiry form" className="grid gap-3">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Get in touch</h1>
              <p className="mt-1 text-sm text-slate-600">
                Leave your details and we'll get back to you.
              </p>
            </div>
            <label className="text-sm">
              Your name
              <input
                value={form.name}
                onChange={set('name')}
                required
                maxLength={120}
                className={input}
              />
            </label>
            <label className="text-sm">
              Email
              <input
                type="email"
                value={form.email}
                onChange={set('email')}
                required
                className={input}
              />
            </label>
            <label className="text-sm">
              Phone (optional)
              <input type="tel" value={form.phone} onChange={set('phone')} className={input} />
            </label>
            <label className="text-sm">
              Company (optional)
              <input
                value={form.company}
                onChange={set('company')}
                maxLength={120}
                className={input}
              />
            </label>
            {/* Honeypot: hidden from people and screen readers. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>
                Website
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.website}
                  onChange={set('website')}
                />
              </label>
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={submit.isPending}
              className="rounded bg-blue-700 py-2 text-white disabled:opacity-60"
            >
              {submit.isPending ? 'Sending…' : 'Send enquiry'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
