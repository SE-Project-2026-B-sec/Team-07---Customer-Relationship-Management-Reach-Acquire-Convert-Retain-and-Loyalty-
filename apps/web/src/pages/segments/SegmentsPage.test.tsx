import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NAV } from '../../components/Layout';
import { SegmentsPage } from './SegmentsPage';
import { splitList, type Segment, type SegmentFilter } from './types';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const makeSegment = (id: string, name: string, extra: Partial<Segment> = {}): Segment => ({
  id,
  name,
  filter: {},
  summary: 'All consenting contacts',
  audienceSize: 120,
  campaignCount: 0,
  createdAt: '2026-11-01T10:00:00.000Z',
  ...extra,
});

/** Fake API: the preview count is 10 per city, 5 if a tier is chosen, else 150. */
function mockServer(initial: Segment[]) {
  const segments = [...initial];
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.endsWith('/segments/preview')) {
      const { filter } = JSON.parse(String(init?.body)) as { filter: SegmentFilter };
      const size = filter.tiers?.length ? 5 : filter.cities ? filter.cities.length * 10 : 150;
      return json({
        audienceSize: size,
        sample: [{ id: 'c1', name: 'Asha Rao', email: 'a@x.test', city: 'Pune', tier: 'GOLD' }],
        summary: '',
      });
    }
    if (method === 'POST' && url.endsWith('/segments')) {
      const body = JSON.parse(String(init?.body));
      const created = makeSegment(`s${segments.length + 1}`, body.name, {
        filter: body.filter,
        summary: 'City: Pune',
        audienceSize: 10,
      });
      segments.unshift(created);
      return json(created, 201);
    }
    const patch = url.match(/\/segments\/([^/?]+)$/);
    if (method === 'PATCH' && patch) {
      const s = segments.find((x) => x.id === patch[1])!;
      Object.assign(s, JSON.parse(String(init?.body)));
      return json(s);
    }
    if (method === 'GET' && url.includes('/segments')) {
      return json({ data: segments, page: 1, pageSize: 20, total: segments.length });
    }
    return json({}, 404);
  });
  return { segments, fetchMock };
}

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <SegmentsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

/** Body of the save request (ignores the live preview, which is also a POST). */
const bodyOf = (fetchMock: ReturnType<typeof mockServer>['fetchMock'], method: string) =>
  JSON.parse(
    String(
      fetchMock.mock.calls.find(
        ([url, i]) => i?.method === method && !String(url).endsWith('/preview'),
      )?.[1]?.body,
    ),
  );

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SegmentsPage (CRM-17)', () => {
  it('lists segments with their rules, audience size and campaign count', async () => {
    mockServer([
      makeSegment('s1', 'Gold in Pune', {
        summary: 'City: Pune · Tier: Gold',
        audienceSize: 1234,
        campaignCount: 2,
      }),
    ]);
    renderPage();

    const row = (await screen.findByText('Gold in Pune')).closest('tr')!;
    expect(within(row).getByText('City: Pune · Tier: Gold')).toBeInTheDocument();
    expect(within(row).getByText('1,234')).toBeInTheDocument();
    expect(within(row).getByText('2')).toBeInTheDocument();
  });

  it('shows a helpful message when there are no segments', async () => {
    mockServer([]);
    renderPage();
    expect(await screen.findByText(/No segments yet/)).toBeInTheDocument();
  });

  it('TC-REACH-03 shows a live audience count while the rules are set, then saves', async () => {
    const { fetchMock } = mockServer([]);
    renderPage();
    await screen.findByText(/No segments yet/);

    fireEvent.click(screen.getByRole('button', { name: 'New segment' }));
    const preview = screen.getByRole('complementary', { name: 'Audience preview' });
    expect(await within(preview).findByText('150')).toBeInTheDocument();
    expect(
      within(preview).getByText(/not agreed to marketing are always left out/),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Segment name'), { target: { value: 'Pune buyers' } });
    fireEvent.change(screen.getByLabelText(/Cities/), { target: { value: 'Pune, , Mumbai ' } });
    expect(await within(preview).findByText('20')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Ordered in the last'));
    fireEvent.change(screen.getByLabelText('Number of days'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save segment' }));

    expect(await screen.findByText('Pune buyers')).toBeInTheDocument();
    expect(bodyOf(fetchMock, 'POST')).toEqual({
      name: 'Pune buyers',
      filter: { cities: ['Pune', 'Mumbai'], orderedWithinDays: 30 },
    });
  });

  it('edits an existing segment with its rules filled in', async () => {
    const { fetchMock } = mockServer([
      makeSegment('s1', 'Lapsed gold', { filter: { tiers: ['GOLD'], noOrderForDays: 90 } }),
    ]);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Lapsed gold' }));
    expect(screen.getByLabelText('Gold')).toBeChecked();
    expect(screen.getByLabelText('No order for')).toBeChecked();
    expect(screen.getByLabelText('Number of days')).toHaveValue(90);

    fireEvent.click(screen.getByLabelText('Platinum'));
    fireEvent.click(screen.getByRole('button', { name: 'Save segment' }));

    await screen.findByRole('button', { name: 'New segment' });
    expect(bodyOf(fetchMock, 'PATCH')).toEqual({
      name: 'Lapsed gold',
      filter: { tiers: ['GOLD', 'PLATINUM'], noOrderForDays: 90 },
    });
  });

  it('shows the API message when saving fails', async () => {
    mockServer([]);
    renderPage();
    await screen.findByText(/No segments yet/);
    fireEvent.click(screen.getByRole('button', { name: 'New segment' }));
    fireEvent.change(screen.getByLabelText('Segment name'), { target: { value: 'X' } });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request' } }, 400),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save segment' }));
    expect(await screen.findByText('Invalid request')).toBeInTheDocument();
  });
});

describe('Segments menu item', () => {
  const menuFor = (role: string) =>
    NAV.filter((i) => !i.roles || i.roles.includes(role as never)).map((i) => i.label);

  it('is shown to Admin and Marketing only', () => {
    expect(menuFor('ADMIN')).toContain('Segments');
    expect(menuFor('MARKETING')).toContain('Segments');
    for (const role of ['SALES_MANAGER', 'SALES_REP', 'SUPPORT']) {
      expect(menuFor(role)).not.toContain('Segments');
    }
  });
});

describe('splitList', () => {
  it('trims and drops empty entries', () => {
    expect(splitList(' Pune, ,Mumbai ,')).toEqual(['Pune', 'Mumbai']);
    expect(splitList('')).toEqual([]);
  });
});
