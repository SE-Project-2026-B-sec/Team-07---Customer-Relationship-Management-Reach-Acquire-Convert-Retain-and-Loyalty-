import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuditLogPage, describe as describeEntry, type AuditEntry } from './AuditLogPage';

const entry = (id: string, extra: Partial<AuditEntry>): AuditEntry => ({
  id,
  at: '2026-11-02T09:30:00.000Z',
  action: 'UPDATE',
  entity: 'Deal',
  entityId: '4f1c2a9e-0000-4000-8000-000000000001',
  userId: 'u1',
  userName: 'Sales Manager',
  userEmail: 'manager@crm.test',
  userRole: 'SALES_MANAGER',
  details: null,
  ...extra,
});

const entries: AuditEntry[] = [
  entry('a1', {
    details: { changes: { stage: { from: 'PROSPECTING', to: 'QUALIFIED' } } },
  }),
  entry('a2', {
    action: 'DELETE',
    entity: 'Contact',
    userName: null,
    userEmail: null,
    details: { before: { name: 'Asha Rao' } },
  }),
];

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function mockServer() {
  const urls: URL[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input), 'http://x');
    urls.push(url);
    return json({ data: entries, page: 1, pageSize: 25, total: entries.length });
  });
  return urls;
}

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AuditLogPage />
    </QueryClientProvider>,
  );

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AuditLogPage (CRM-31)', () => {
  it('TC-ANA-05 shows who changed what and when', async () => {
    mockServer();
    renderPage();

    const row = (await screen.findByText('stage: PROSPECTING → QUALIFIED')).closest('tr')!;
    expect(within(row).getByText('Sales Manager')).toBeInTheDocument();
    expect(within(row).getByText('Updated')).toBeInTheDocument();
    expect(within(row).getByText('Deal')).toBeInTheDocument();
    expect(within(row).getByText('4f1c2a9e')).toBeInTheDocument();
    expect(within(row).getByText(/2 Nov 2026/)).toBeInTheDocument();
  });

  it('names deleted records and shows changes without a user as System / website', async () => {
    mockServer();
    renderPage();

    const row = (await screen.findByText('Asha Rao')).closest('tr')!;
    expect(within(row).getByText('Deleted')).toBeInTheDocument();
    expect(within(row).getByText('System / website')).toBeInTheDocument();
  });

  it('sends the filters to the API', async () => {
    const urls = mockServer();
    renderPage();
    await screen.findByText('Asha Rao');

    fireEvent.change(screen.getByLabelText('Record type'), { target: { value: 'Deal' } });
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'UPDATE' } });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01' } });

    await waitFor(() => {
      const last = urls[urls.length - 1];
      expect(last.searchParams.get('entity')).toBe('Deal');
      expect(last.searchParams.get('action')).toBe('UPDATE');
      expect(last.searchParams.get('from')).toBe('2026-11-01');
      expect(last.searchParams.get('page')).toBe('1');
    });
  });
});

describe('describe() audit details (CRM-31)', () => {
  it('summarises bulk changes and created records', () => {
    expect(describeEntry(entry('b', { details: { bulk: true, count: 12 } }))).toEqual([
      '12 records at once',
    ]);
    expect(
      describeEntry(entry('c', { action: 'CREATE', details: { after: { title: 'Pilot' } } })),
    ).toEqual(['Pilot']);
    expect(
      describeEntry(entry('d', { details: { changes: { phone: { from: null, to: '+91 98' } } } })),
    ).toEqual(['phone: — → +91 98']);
  });
});
