import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LeadsPage } from './LeadsPage';
import { heatOf, type ScoreRule } from './scoring';
import type { Lead } from './types';

// The page reads the logged-in role; tests switch it here.
const auth = vi.hoisted(() => ({ role: 'SALES_MANAGER' as string }));
vi.mock('../../auth/AuthContext', () => ({
  useOptionalAuth: () => ({ user: { id: 'u1', name: 'Test', email: 't@x.test', role: auth.role } }),
}));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const makeLead = (id: string, name: string, score: number): Lead => ({
  id,
  name,
  email: `${id}@example.test`,
  phone: null,
  company: null,
  source: 'WEB',
  status: 'NEW',
  score,
  isDuplicate: false,
  ownerId: null,
  ownerName: null,
  campaignId: null,
  campaignName: null,
  createdAt: '2026-11-01T10:00:00.000Z',
});

const RULES: ScoreRule[] = [
  { field: 'source', match: { equals: 'REFERRAL' }, points: 30, isActive: true },
  { field: 'phone', match: { present: true }, points: 10, isActive: true },
];

function mockServer(leads: Lead[]) {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.endsWith('/lead-scoring/rules') && method === 'GET') return json({ rules: RULES });
    if (url.endsWith('/lead-scoring/rules') && method === 'PUT') {
      return json({ rules: JSON.parse(String(init?.body)).rules, rescored: 12 });
    }
    if (url.includes('/leads')) {
      const byScore = new URL(url, 'http://x').searchParams.get('sort') === 'score';
      const rows = byScore ? [...leads].sort((a, b) => b.score - a.score) : leads;
      return json({ data: rows, page: 1, pageSize: 20, total: rows.length });
    }
    return json({}, 404);
  });
  return fetchMock;
}

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <LeadsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  auth.role = 'SALES_MANAGER';
});

describe('Lead scores on the Leads page (CRM-20)', () => {
  it('shows each lead’s score with a Hot / Warm / Cold label', async () => {
    mockServer([
      makeLead('l1', 'Priya', 85),
      makeLead('l2', 'Rohan', 45),
      makeLead('l3', 'Kavya', 10),
    ]);
    renderPage();

    const row = (name: string) => within(screen.getByText(name).closest('tr')!);
    await screen.findByText('Priya');
    expect(row('Priya').getByText('85')).toBeInTheDocument();
    expect(row('Priya').getByText('Hot')).toBeInTheDocument();
    expect(row('Rohan').getByText('Warm')).toBeInTheDocument();
    expect(row('Kavya').getByText('Cold')).toBeInTheDocument();
  });

  it('sorts by highest score', async () => {
    const fetchMock = mockServer([makeLead('l1', 'Low', 5), makeLead('l2', 'High', 90)]);
    renderPage();
    await screen.findByText('Low');

    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'score' } });

    await vi.waitFor(() => {
      const names = screen
        .getAllByRole('row')
        .slice(1)
        .map((r) => r.querySelector('td')?.textContent);
      expect(names).toEqual(['High', 'Low']);
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('sort=score'))).toBe(true);
  });
});

describe('Scoring rules panel (CRM-20)', () => {
  it('is offered to Admin and Sales Manager only', async () => {
    mockServer([]);
    auth.role = 'SALES_REP';
    renderPage();
    await screen.findByText('No leads found.');
    expect(screen.queryByRole('button', { name: 'Scoring rules' })).not.toBeInTheDocument();
    cleanup();

    auth.role = 'ADMIN';
    renderPage();
    expect(await screen.findByRole('button', { name: 'Scoring rules' })).toBeInTheDocument();
  });

  it('TC-ACQ-04 edits the rules, saves them and reports how many leads were re-scored', async () => {
    const fetchMock = mockServer([]);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Scoring rules' }));

    const panel = within(await screen.findByRole('form', { name: 'Scoring rules' }));
    expect(await panel.findByLabelText('Rule 1 value')).toHaveValue('REFERRAL');
    expect(panel.getByText(/would score 40/)).toBeInTheDocument();

    fireEvent.change(panel.getByLabelText('Rule 1 points'), { target: { value: '40' } });
    fireEvent.click(panel.getByLabelText('Rule 2 on'));
    fireEvent.click(panel.getByRole('button', { name: 'Add rule' }));
    fireEvent.change(panel.getByLabelText('Rule 3 condition'), { target: { value: 'activities' } });
    fireEvent.change(panel.getByLabelText('Rule 3 value'), { target: { value: '3' } });
    fireEvent.click(panel.getByRole('button', { name: 'Save and re-score' }));

    expect(await panel.findByRole('status')).toHaveTextContent('12 leads got a new score');
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(JSON.parse(String(put?.[1]?.body)).rules).toEqual([
      { field: 'source', match: { equals: 'REFERRAL' }, points: 40, isActive: true },
      { field: 'phone', match: { present: true }, points: 10, isActive: false },
      { field: 'activities', match: { min: 3 }, points: 10, isActive: true },
    ]);
  });

  it('removes a rule', async () => {
    mockServer([]);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Scoring rules' }));
    const panel = within(await screen.findByRole('form', { name: 'Scoring rules' }));
    await panel.findByLabelText('Rule 2 points');

    fireEvent.click(panel.getByRole('button', { name: 'Remove rule 1' }));
    expect(panel.queryByLabelText('Rule 2 points')).not.toBeInTheDocument();
    expect(panel.getByLabelText('Rule 1 condition')).toHaveValue('phone');
  });
});

describe('heatOf', () => {
  it('splits scores into Hot (70+), Warm (40–69) and Cold', () => {
    expect([100, 70, 69, 40, 39, 0].map(heatOf)).toEqual([
      'Hot',
      'Hot',
      'Warm',
      'Warm',
      'Cold',
      'Cold',
    ]);
  });
});
