import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampaignsPage } from './CampaignsPage';
import type { Campaign } from './types';

const makeCampaign = (id: string, name: string, extra: Partial<Campaign> = {}): Campaign => ({
  id,
  name,
  channel: 'EMAIL',
  budget: 50000,
  status: 'SCHEDULED',
  startDate: '2026-12-01T00:00:00.000Z',
  endDate: '2026-12-31T00:00:00.000Z',
  segmentId: null,
  segmentName: null,
  createdAt: '2026-11-02T10:00:00.000Z',
  updatedAt: '2026-11-02T10:00:00.000Z',
  ...extra,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

type Segment = { id: string; name: string };

/** A small fake of the campaigns API. `segments: null` behaves like /segments not existing yet. */
function mockServer(
  initial: Campaign[],
  options: { segments?: Segment[] | null; refuseSave?: string } = {},
) {
  const campaigns = [...initial];
  const { segments = null, refuseSave } = options;
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://x');
    const method = init?.method ?? 'GET';

    if (url.pathname.endsWith('/segments')) {
      return segments
        ? json({ data: segments, page: 1, pageSize: 100, total: segments.length })
        : json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404);
    }
    if ((method === 'POST' || method === 'PATCH') && refuseSave) {
      return json({ error: { code: 'VALIDATION_ERROR', message: refuseSave } }, 400);
    }
    if (method === 'POST' && url.pathname.endsWith('/campaigns')) {
      const body = JSON.parse(String(init?.body));
      const created = makeCampaign(`c${campaigns.length + 1}`, body.name, {
        channel: body.channel,
        budget: body.budget,
        status: body.status,
        startDate: `${body.startDate}T00:00:00.000Z`,
        endDate: `${body.endDate}T00:00:00.000Z`,
        segmentId: body.segmentId ?? null,
        segmentName: segments?.find((s) => s.id === body.segmentId)?.name ?? null,
      });
      campaigns.unshift(created);
      return json(created, 201);
    }
    const id = url.pathname.match(/\/campaigns\/([^/]+)$/)?.[1];
    if (method === 'PATCH' && id) {
      const body = JSON.parse(String(init?.body));
      const index = campaigns.findIndex((c) => c.id === id);
      const current = campaigns[index];
      if (!current) return json({}, 404);
      const updated = {
        ...current,
        name: body.name,
        channel: body.channel,
        budget: body.budget,
        status: body.status,
        startDate: `${body.startDate}T00:00:00.000Z`,
        endDate: `${body.endDate}T00:00:00.000Z`,
      };
      campaigns[index] = updated;
      return json(updated);
    }
    if (method === 'GET' && url.pathname.endsWith('/campaigns')) {
      const status = url.searchParams.get('status');
      const rows = campaigns.filter((c) => !status || c.status === status);
      return json({ data: rows, page: 1, pageSize: 20, total: rows.length });
    }
    return json({}, 404);
  });
  const sent = (method: string) =>
    fetchMock.mock.calls.filter(([, init]) => init?.method === method);
  return { campaigns, fetchMock, sent };
}

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <CampaignsPage />
    </QueryClientProvider>,
  );

const fillForm = (over: { name?: string; budget?: string; start?: string; end?: string } = {}) => {
  fireEvent.change(screen.getByLabelText('Name'), {
    target: { value: over.name ?? 'Winter sale' },
  });
  fireEvent.change(screen.getByLabelText('Channel'), { target: { value: 'SMS' } });
  fireEvent.change(screen.getByLabelText('Budget (₹)'), {
    target: { value: over.budget ?? '25000' },
  });
  fireEvent.change(screen.getByLabelText('Start date'), {
    target: { value: over.start ?? '2026-12-01' },
  });
  fireEvent.change(screen.getByLabelText('End date'), {
    target: { value: over.end ?? '2026-12-31' },
  });
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CampaignsPage', () => {
  it('lists campaigns with channel, budget, dates and status, and filters by status', async () => {
    const { fetchMock } = mockServer([
      makeCampaign('c1', 'Diwali push', { segmentName: 'VIP customers' }),
      makeCampaign('c2', 'Spring teaser', { status: 'DRAFT', channel: 'SOCIAL', budget: 1200.5 }),
    ]);
    renderPage();

    const row = await screen.findByRole('row', { name: /Diwali push/ }, { timeout: 5000 });
    expect(row).toHaveTextContent('Email');
    expect(row).toHaveTextContent('₹50,000');
    expect(row).toHaveTextContent('1 Dec 2026');
    expect(row).toHaveTextContent('31 Dec 2026');
    expect(row).toHaveTextContent('VIP customers');
    expect(row).toHaveTextContent('Scheduled');

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'DRAFT' } });
    expect(await screen.findByText('Spring teaser')).toBeInTheDocument();
    expect(screen.queryByText('Diwali push')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('status=DRAFT'))).toBe(true);
  });

  it('TC-REACH-01 creates a campaign and it shows as Scheduled', async () => {
    const { sent } = mockServer([]);
    renderPage();
    await screen.findByText('No campaigns found.');

    fireEvent.click(screen.getByRole('button', { name: 'New campaign' }));
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Schedule campaign' }));

    const row = await screen.findByRole('row', { name: /Winter sale/ });
    expect(row).toHaveTextContent('SMS');
    expect(row).toHaveTextContent('₹25,000');
    expect(within(row).getByText('Scheduled')).toBeInTheDocument();

    const body = JSON.parse(String(sent('POST')[0]?.[1]?.body));
    expect(body).toMatchObject({
      name: 'Winter sale',
      channel: 'SMS',
      budget: 25000,
      startDate: '2026-12-01',
      endDate: '2026-12-31',
      status: 'SCHEDULED',
    });
    expect(body).not.toHaveProperty('segmentId');
  });

  it('saves a draft when "Save as draft" is used', async () => {
    const { sent } = mockServer([]);
    renderPage();
    await screen.findByText('No campaigns found.');

    fireEvent.click(screen.getByRole('button', { name: 'New campaign' }));
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }));

    const row = await screen.findByRole('row', { name: /Winter sale/ });
    expect(within(row).getByText('Draft')).toBeInTheDocument();
    expect(JSON.parse(String(sent('POST')[0]?.[1]?.body)).status).toBe('DRAFT');
  });

  it('TC-REACH-02 rejects an end date before the start date without calling the API', async () => {
    const { sent } = mockServer([]);
    renderPage();
    await screen.findByText('No campaigns found.');

    fireEvent.click(screen.getByRole('button', { name: 'New campaign' }));
    fillForm({ start: '2026-12-31', end: '2026-12-01' });
    fireEvent.click(screen.getByRole('button', { name: 'Schedule campaign' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'End date must be on or after the start date',
    );
    expect(sent('POST')).toHaveLength(0);
  });

  it('asks for the missing fields before saving', async () => {
    const { sent } = mockServer([]);
    renderPage();
    await screen.findByText('No campaigns found.');

    fireEvent.click(screen.getByRole('button', { name: 'New campaign' }));
    fireEvent.click(screen.getByRole('button', { name: 'Schedule campaign' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Name is required');

    fillForm({ budget: '-5' });
    fireEvent.click(screen.getByRole('button', { name: 'Schedule campaign' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Budget cannot be negative');
    expect(sent('POST')).toHaveLength(0);
  });

  it('shows the server message if saving is refused', async () => {
    mockServer([], { refuseSave: 'End date must be on or after the start date' });
    renderPage();
    await screen.findByText('No campaigns found.');

    fireEvent.click(screen.getByRole('button', { name: 'New campaign' }));
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Schedule campaign' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'End date must be on or after the start date',
    );
  });

  it('edits a scheduled campaign and locks a running one', async () => {
    const { sent } = mockServer([
      makeCampaign('c1', 'Diwali push'),
      makeCampaign('c2', 'Live now', { status: 'RUNNING' }),
    ]);
    renderPage();
    await screen.findByText('Diwali push');

    expect(screen.queryByRole('button', { name: 'Edit Live now' })).not.toBeInTheDocument();
    expect(screen.getByText('Locked')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Diwali push' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Diwali push');
    expect(screen.getByLabelText('Budget (₹)')).toHaveValue(50000);
    expect(screen.getByLabelText('Start date')).toHaveValue('2026-12-01');

    fireEvent.change(screen.getByLabelText('Budget (₹)'), { target: { value: '60000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(screen.getByRole('row', { name: /Diwali push/ })).toHaveTextContent('₹60,000'),
    );
    const [url, init] = sent('PATCH')[0] ?? [];
    expect(String(url)).toMatch(/\/campaigns\/c1$/);
    expect(JSON.parse(String(init?.body))).toMatchObject({ budget: 60000, status: 'SCHEDULED' });
  });

  it('offers the segment dropdown only when segments exist', async () => {
    const { sent } = mockServer([], { segments: [{ id: 's1', name: 'VIP customers' }] });
    renderPage();
    await screen.findByText('No campaigns found.');

    fireEvent.click(screen.getByRole('button', { name: 'New campaign' }));
    const select = await screen.findByLabelText('Segment (optional)');
    fillForm();
    fireEvent.change(select, { target: { value: 's1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Schedule campaign' }));

    const row = await screen.findByRole('row', { name: /Winter sale/ });
    expect(row).toHaveTextContent('VIP customers');
    expect(JSON.parse(String(sent('POST')[0]?.[1]?.body)).segmentId).toBe('s1');
  });

  it('hides the segment dropdown while the segments API is missing', async () => {
    const { fetchMock } = mockServer([], { segments: null });
    renderPage();
    await screen.findByText('No campaigns found.');

    fireEvent.click(screen.getByRole('button', { name: 'New campaign' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/segments'))).toBe(true),
    );
    expect(screen.queryByLabelText('Segment (optional)')).not.toBeInTheDocument();
  });
});
