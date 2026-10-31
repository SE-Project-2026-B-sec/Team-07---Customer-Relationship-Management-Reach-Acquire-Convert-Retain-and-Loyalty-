import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActivitiesPanel } from './ActivitiesPanel';
import { OverdueTasksBox } from './OverdueTasksBox';
import type { Activity } from './types';

const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY).toISOString();

const makeActivity = (over: Partial<Activity> & Pick<Activity, 'id' | 'subject'>): Activity => ({
  type: 'TASK',
  notes: null,
  dueAt: null,
  done: false,
  overdue: false,
  createdAt: '2026-10-29T00:00:00.000Z',
  userId: 'u1',
  userName: 'Sales Rep One',
  leadId: null,
  contactId: null,
  dealId: 'd1',
  linkLabel: 'Alpha deal',
  ...over,
});

function mockServer(initial: Activity[]) {
  const items = initial.map((a) => ({ ...a }));
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

    const patchMatch = url.match(/\/activities\/([^/?]+)$/);
    if (patchMatch && method === 'PATCH') {
      const target = items.find((a) => a.id === patchMatch[1]);
      const body = JSON.parse(String(init?.body));
      if (target) {
        Object.assign(target, body);
        if (body.done) target.overdue = false;
      }
      return json(target);
    }
    if (method === 'POST' && url.endsWith('/activities')) {
      const body = JSON.parse(String(init?.body));
      const created = makeActivity({
        id: `a${items.length + 1}`,
        subject: body.subject,
        type: body.type,
        dealId: body.dealId ?? null,
      });
      items.push(created);
      return json(created, 201);
    }
    if (method === 'GET' && url.includes('/activities')) {
      return json({ data: items, page: 1, pageSize: 100, total: items.length });
    }
    return json({}, 404);
  });
  return { items, fetchMock };
}

const wrap = (ui: ReactElement) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {ui}
    </QueryClientProvider>,
  );

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Activities panel', () => {
  it('TC-CONV-07 a task due yesterday shows a red Overdue badge', async () => {
    mockServer([
      makeActivity({ id: 'a1', subject: 'Call back Asha', dueAt: daysFromNow(-1), overdue: true }),
      makeActivity({ id: 'a2', subject: 'Send quote', dueAt: daysFromNow(2) }),
    ]);
    wrap(<ActivitiesPanel link={{ dealId: 'd1' }} />);

    const overdueItem = (await screen.findByText('Call back Asha')).closest('li')!;
    expect(within(overdueItem).getByText('Overdue')).toBeTruthy();

    const futureItem = screen.getByText('Send quote').closest('li')!;
    expect(within(futureItem).queryByText('Overdue')).toBeNull();
    expect(screen.getAllByText('Overdue')).toHaveLength(1);
  });

  it('adds an activity linked to the deal', async () => {
    const { fetchMock } = mockServer([]);
    wrap(<ActivitiesPanel link={{ dealId: 'd1' }} />);
    await screen.findByText('No activities yet.');

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'CALL' } });
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Follow up' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add activity' }));

    expect(await screen.findByText('Follow up')).toBeTruthy();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
      type: 'CALL',
      subject: 'Follow up',
      dealId: 'd1',
    });
  });

  it('marks an activity done and removes its Overdue badge', async () => {
    const { items } = mockServer([
      makeActivity({ id: 'a1', subject: 'Call back Asha', dueAt: daysFromNow(-1), overdue: true }),
    ]);
    wrap(<ActivitiesPanel link={{ dealId: 'd1' }} />);
    await screen.findByText('Call back Asha');

    fireEvent.click(screen.getByRole('button', { name: 'Mark Call back Asha as done' }));

    await waitFor(() => expect(screen.queryByText('Overdue')).toBeNull());
    expect(await screen.findByText('Done')).toBeTruthy();
    expect(items[0]?.done).toBe(true);
  });
});

describe('My overdue tasks box', () => {
  it('shows the overdue count and the first tasks', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              makeActivity({
                id: 'a1',
                subject: 'Call back Asha',
                dueAt: daysFromNow(-1),
                overdue: true,
              }),
            ],
            page: 1,
            pageSize: 5,
            total: 3,
          }),
          { status: 200 },
        ),
    );
    wrap(<OverdueTasksBox />);

    expect(await screen.findByText('Call back Asha')).toBeTruthy();
    expect(screen.getByTestId('overdue-count').textContent).toBe('3');
    expect(screen.getByText('and 2 more')).toBeTruthy();
  });
});
