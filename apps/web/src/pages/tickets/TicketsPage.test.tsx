import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '../../auth/AuthContext';
import { TicketsPage } from './TicketsPage';
import { formatDuration, slaText, type Ticket } from './types';

// The page only reads the role, so a tiny fake of the auth hook is enough.
let role: Role = 'SUPPORT';
vi.mock('../../auth/AuthContext', () => ({
  useOptionalAuth: () => ({ user: { id: 'u1', name: 'Agent', email: 'a@crm.test', role } }),
}));

const HOUR = 3_600_000;

const makeTicket = (id: string, subject: string, extra: Partial<Ticket> = {}): Ticket => ({
  id,
  subject,
  description: 'Details',
  priority: 'MEDIUM',
  status: 'OPEN',
  slaDueAt: new Date(Date.now() + 10 * HOUR).toISOString(),
  resolvedAt: null,
  breached: false,
  contactId: 'c1',
  contactName: 'Asha Rao',
  assigneeId: 'u1',
  assigneeName: 'Agent',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...extra,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** A small fake of the tickets API that records every request. */
function mockServer(initial: Ticket[]) {
  const tickets = [...initial];
  const calls: { method: string; url: URL; body: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://x');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });

    if (url.pathname.endsWith('/contacts')) {
      return json({ items: [{ id: 'c1', name: 'Asha Rao', email: 'asha@example.com' }] });
    }
    if (url.pathname.endsWith('/tickets/assignees')) {
      return json([{ id: 'u1', name: 'Agent' }]);
    }
    if (method === 'POST') {
      const created = makeTicket(`t${tickets.length + 1}`, body.subject, {
        priority: body.priority,
        slaDueAt: new Date(Date.now() + 4 * HOUR).toISOString(),
      });
      tickets.unshift(created);
      return json(created, 201);
    }
    const id = url.pathname.match(/\/tickets\/([^/]+)$/)?.[1];
    if (method === 'PATCH' && id) {
      const t = tickets.find((x) => x.id === id)!;
      Object.assign(t, body, { breached: false });
      return json(t);
    }
    const shown =
      url.searchParams.get('breached') === 'true' ? tickets.filter((t) => t.breached) : tickets;
    return json({ data: shown, page: 1, pageSize: 20, total: shown.length });
  });
  return calls;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TicketsPage />
    </QueryClientProvider>,
  );
}

const rowFor = async (subject: string) =>
  (await screen.findByText(subject)).closest('tr') as HTMLElement;

beforeEach(() => {
  role = 'SUPPORT';
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('TicketsPage (CRM-21)', () => {
  it('TC-RET-01 shows a breached ticket in red with an "SLA breached" badge', async () => {
    mockServer([
      makeTicket('t1', 'Order not delivered', {
        priority: 'URGENT',
        breached: true,
        slaDueAt: new Date(Date.now() - 2 * HOUR).toISOString(),
      }),
      makeTicket('t2', 'Login issue'),
    ]);
    renderPage();

    const late = await rowFor('Order not delivered');
    expect(late).toHaveAttribute('data-breached', 'true');
    expect(late.className).toContain('bg-red-50');
    expect(within(late).getByText('SLA breached')).toBeInTheDocument();
    expect(within(late).getByText(/^Overdue by 2h/)).toBeInTheDocument();

    const onTime = await rowFor('Login issue');
    expect(onTime).toHaveAttribute('data-breached', 'false');
    expect(within(onTime).queryByText('SLA breached')).not.toBeInTheDocument();
    expect(within(onTime).getByText(/^Due in/)).toBeInTheDocument();
  });

  it('"SLA breached only" asks the API for breached tickets', async () => {
    const calls = mockServer([
      makeTicket('t1', 'Late one', { breached: true }),
      makeTicket('t2', 'On time'),
    ]);
    renderPage();
    await screen.findByText('On time');

    fireEvent.click(screen.getByLabelText('SLA breached only'));

    await waitFor(() =>
      expect(calls.some((c) => c.url.searchParams.get('breached') === 'true')).toBe(true),
    );
    expect(await screen.findByText('Late one')).toBeInTheDocument();
    expect(screen.queryByText('On time')).not.toBeInTheDocument();
  });

  it('changing the status sends a PATCH and shows the new status', async () => {
    const calls = mockServer([makeTicket('t1', 'Refund request')]);
    renderPage();

    const select = await screen.findByLabelText('Status of Refund request');
    fireEvent.change(select, { target: { value: 'RESOLVED' } });

    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ status: 'RESOLVED' }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Status of Refund request')).toHaveValue('RESOLVED'),
    );
  });

  it('creates a ticket for the chosen customer and priority', async () => {
    const calls = mockServer([]);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'New ticket' }));
    const form = screen.getByRole('form', { name: 'New ticket' });
    fireEvent.change(within(form).getByLabelText('Subject'), {
      target: { value: 'Points not credited' },
    });
    fireEvent.change(within(form).getByLabelText('Description'), {
      target: { value: 'Customer says points are missing' },
    });
    await within(form).findByRole('option', { name: 'Asha Rao (asha@example.com)' });
    fireEvent.change(within(form).getByLabelText('Customer'), { target: { value: 'c1' } });
    fireEvent.change(within(form).getByLabelText('Priority'), { target: { value: 'URGENT' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Create ticket' }));

    expect(await screen.findByText('Points not credited')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      subject: 'Points not credited',
      description: 'Customer says points are missing',
      priority: 'URGENT',
      contactId: 'c1',
    });
    expect(screen.queryByRole('form', { name: 'New ticket' })).not.toBeInTheDocument();
  });

  it('asks for a customer before creating a ticket', async () => {
    mockServer([]);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'New ticket' }));
    const form = screen.getByRole('form', { name: 'New ticket' });
    fireEvent.change(within(form).getByLabelText('Subject'), { target: { value: 'X' } });
    fireEvent.change(within(form).getByLabelText('Description'), { target: { value: 'Y' } });
    fireEvent.submit(form);

    expect(await within(form).findByRole('alert')).toHaveTextContent('Choose the customer');
  });

  it('Sales Manager can read tickets but not create or change them', async () => {
    role = 'SALES_MANAGER';
    mockServer([makeTicket('t1', 'Wrong invoice', { status: 'IN_PROGRESS' })]);
    renderPage();

    const row = await rowFor('Wrong invoice');
    expect(within(row).getByText('In progress')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New ticket' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Status of Wrong invoice')).not.toBeInTheDocument();
  });
});

describe('SLA text helpers (CRM-21)', () => {
  const now = Date.parse('2026-11-02T10:00:00Z');

  it('formats durations', () => {
    expect(formatDuration(45 * 60_000)).toBe('45m');
    expect(formatDuration(3 * HOUR + 20 * 60_000)).toBe('3h 20m');
    expect(formatDuration(50 * HOUR)).toBe('2d 2h');
  });

  it('describes due, overdue and resolved tickets', () => {
    const due = new Date(now + 4 * HOUR).toISOString();
    expect(slaText(makeTicket('a', 'A', { slaDueAt: due }), now)).toBe('Due in 4h 0m');
    const late = new Date(now - 90 * 60_000).toISOString();
    expect(slaText(makeTicket('b', 'B', { slaDueAt: late }), now)).toBe('Overdue by 1h 30m');
    expect(slaText(makeTicket('c', 'C', { status: 'CLOSED', resolvedAt: null }), now)).toBe(
      'Resolved',
    );
  });
});
