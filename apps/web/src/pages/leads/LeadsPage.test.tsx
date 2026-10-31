import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EnquiryForm } from '../EnquiryForm';
import { LeadsPage } from './LeadsPage';
import type { Lead } from './types';

const makeLead = (id: string, name: string, extra: Partial<Lead> = {}): Lead => ({
  id,
  name,
  email: `${id}@example.test`,
  phone: null,
  company: 'Sharma Traders',
  source: 'WEB',
  status: 'NEW',
  score: 0,
  isDuplicate: false,
  ownerId: null,
  ownerName: null,
  campaignId: null,
  campaignName: null,
  createdAt: '2026-10-30T10:00:00.000Z',
  ...extra,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function mockServer(initial: Lead[]) {
  const leads = [...initial];
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (method === 'POST' && url.endsWith('/leads')) {
      const body = JSON.parse(String(init?.body));
      const created = makeLead(`l${leads.length + 1}`, body.name, { source: body.source });
      leads.unshift(created);
      return json(created, 201);
    }
    if (method === 'GET' && url.includes('/leads')) {
      const params = new URL(url, 'http://x').searchParams;
      const q = params.get('q')?.toLowerCase();
      const rows = leads.filter((l) => !q || l.name.toLowerCase().includes(q));
      return json({ data: rows, page: 1, pageSize: 20, total: rows.length });
    }
    return json({}, 404);
  });
  return { leads, fetchMock };
}

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LeadsPage', () => {
  it('lists leads with source, status, owner and a duplicate badge', async () => {
    mockServer([
      makeLead('l1', 'Priya Sharma', { ownerName: 'Sales Rep One' }),
      makeLead('l2', 'Rohan Iyer', { isDuplicate: true, status: 'QUALIFIED' }),
    ]);
    renderWithProviders(<LeadsPage />);

    await screen.findByText('Priya Sharma');
    const table = within(screen.getByRole('table'));
    expect(table.getByText('Sales Rep One')).toBeInTheDocument();
    expect(table.getByText('Unassigned')).toBeInTheDocument();
    expect(table.getByText('Qualified')).toBeInTheDocument();
    expect(table.getAllByText('Website')).toHaveLength(2);
    expect(table.getByText('Duplicate')).toBeInTheDocument();
  });

  it('searches by name', async () => {
    mockServer([makeLead('l1', 'Priya Sharma'), makeLead('l2', 'Rohan Iyer')]);
    renderWithProviders(<LeadsPage />);
    await screen.findByText('Rohan Iyer');

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'priya' } });

    expect(await screen.findByText('Priya Sharma')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Rohan Iyer')).not.toBeInTheDocument());
  });

  it('TC-ACQ-01 creates a lead manually and shows it in the list', async () => {
    const { fetchMock } = mockServer([]);
    renderWithProviders(<LeadsPage />);
    await screen.findByText('No leads found.');

    fireEvent.click(screen.getByRole('button', { name: 'New lead' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Kavya Nair' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'kavya@example.test' } });
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'REFERRAL' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save lead' }));

    expect(await screen.findByText('Kavya Nair')).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      name: 'Kavya Nair',
      email: 'kavya@example.test',
      source: 'REFERRAL',
    });
  });

  it('shows the API error if saving fails', async () => {
    mockServer([]);
    renderWithProviders(<LeadsPage />);
    await screen.findByText('No leads found.');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({ error: { code: 'VALIDATION_ERROR', message: 'Enter a valid email' } }, 400),
    );

    fireEvent.click(screen.getByRole('button', { name: 'New lead' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'x@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save lead' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email');
  });
});

describe('EnquiryForm (public website form)', () => {
  it('submits the enquiry and thanks the visitor', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(json({ received: true }, 201));
    renderWithProviders(<EnquiryForm />);

    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Priya Sharma' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'priya@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send enquiry' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Thank you!');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/public\/leads$/);
    expect(JSON.parse(String(init?.body))).toEqual({
      name: 'Priya Sharma',
      email: 'priya@example.test',
    });
  });

  it('hides the honeypot field from people, keyboards and screen readers', () => {
    renderWithProviders(<EnquiryForm />);
    const honeypot = screen.getByLabelText('Website');
    expect(honeypot).toHaveAttribute('tabindex', '-1');
    expect(honeypot.closest('[aria-hidden="true"]')).not.toBeNull();
    // The visible fields are the only ones people can tab to.
    expect(screen.getByLabelText('Your name')).not.toHaveAttribute('tabindex');
  });
});
