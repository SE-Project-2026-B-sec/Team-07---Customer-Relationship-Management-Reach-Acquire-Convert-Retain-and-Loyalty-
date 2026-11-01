import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DealsBoard } from './DealsBoard';
import { formatInr, type Deal } from './types';

const makeDeal = (id: string, title: string, value: number, stage: Deal['stage']): Deal => ({
  id,
  title,
  value,
  stage,
  expectedClose: null,
  wonAt: null,
  contactId: 'c1',
  contactName: 'Asha Rao',
  ownerId: 'u1',
  ownerName: 'Sales Rep One',
});

function mockServer(initial: Deal[], options: { failMove?: boolean } = {}) {
  const deals = initial.map((d) => ({ ...d }));
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

    const stageMatch = url.match(/\/deals\/([^/?]+)\/stage$/);
    if (stageMatch && method === 'PATCH') {
      if (options.failMove) return json({ error: { code: 'FORBIDDEN', message: 'no' } }, 403);
      const target = deals.find((d) => d.id === stageMatch[1]);
      const { stage } = JSON.parse(String(init?.body));
      if (target) {
        target.stage = stage;
        target.wonAt = stage === 'WON' ? new Date().toISOString() : null;
      }
      return json(target);
    }
    if (url.includes('/deals/contacts')) {
      return json([{ id: 'c1', name: 'Asha Rao', email: 'asha@example.test' }]);
    }
    if (method === 'POST' && url.endsWith('/deals')) {
      const body = JSON.parse(String(init?.body));
      const created = makeDeal(`d${deals.length + 1}`, body.title, body.value, 'PROSPECTING');
      deals.push(created);
      return json(created, 201);
    }
    if (method === 'GET' && url.includes('/deals')) {
      return json({ data: deals, page: 1, pageSize: 100, total: deals.length });
    }
    return json({}, 404);
  });
  return { deals, fetchMock };
}

const renderBoard = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DealsBoard />
    </QueryClientProvider>,
  );

const moveTo = (title: string, stage: string) =>
  fireEvent.change(screen.getByLabelText(`Move ${title} to stage`), { target: { value: stage } });

const seed = () => [
  makeDeal('d1', 'Alpha deal', 100000, 'PROSPECTING'),
  makeDeal('d2', 'Beta deal', 50000, 'PROSPECTING'),
  makeDeal('d3', 'Gamma deal', 20000, 'WON'),
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Deals board', () => {
  it('shows each deal in its stage column with counts, ₹ totals and owner initials', async () => {
    mockServer(seed());
    renderBoard();
    await screen.findByText('Alpha deal');
    expect(screen.getByTestId('count-PROSPECTING').textContent).toBe('2');
    expect(screen.getByTestId('total-PROSPECTING').textContent).toBe(formatInr(150000));
    expect(screen.getByTestId('count-WON').textContent).toBe('1');
    expect(screen.getByTestId('count-LOST').textContent).toBe('0');
    expect(screen.getAllByText('SR')).toHaveLength(3);
  });

  it('TC-CONV-03 moving a stage is saved and the totals update', async () => {
    const { deals, fetchMock } = mockServer(seed());
    renderBoard();
    await screen.findByText('Alpha deal');

    moveTo('Alpha deal', 'NEGOTIATION');

    await waitFor(() => {
      expect(screen.getByTestId('count-NEGOTIATION').textContent).toBe('1');
      expect(screen.getByTestId('total-NEGOTIATION').textContent).toBe(formatInr(100000));
      expect(screen.getByTestId('count-PROSPECTING').textContent).toBe('1');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/deals/d1/stage'),
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ stage: 'NEGOTIATION' }) }),
    );
    await waitFor(() => expect(deals.find((d) => d.id === 'd1')?.stage).toBe('NEGOTIATION'));
  });

  it('TC-CONV-04 moving to Won sets the won date and removes the deal from the open pipeline value', async () => {
    const { deals } = mockServer(seed());
    renderBoard();
    await waitFor(() =>
      expect(screen.getByTestId('open-pipeline').textContent).toBe(formatInr(150000)),
    );

    moveTo('Alpha deal', 'WON');

    await waitFor(() =>
      expect(screen.getByTestId('open-pipeline').textContent).toBe(formatInr(50000)),
    );
    await waitFor(() => expect(deals.find((d) => d.id === 'd1')?.wonAt).not.toBeNull());
  });

  it('puts the card back and shows an error when the move fails', async () => {
    mockServer(seed(), { failMove: true });
    renderBoard();
    await screen.findByText('Alpha deal');

    moveTo('Alpha deal', 'LOST');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/put back/);
    await waitFor(() => {
      expect(screen.getByTestId('count-PROSPECTING').textContent).toBe('2');
      expect(screen.getByTestId('count-LOST').textContent).toBe('0');
    });
  });

  it('creates a deal from the New deal form', async () => {
    mockServer(seed());
    renderBoard();
    await screen.findByText('Alpha deal');

    fireEvent.click(screen.getByRole('button', { name: 'New deal' }));
    fireEvent.change(screen.getByLabelText('Deal title'), { target: { value: 'Delta deal' } });
    fireEvent.change(screen.getByLabelText('Value (₹)'), { target: { value: '75000' } });
    await screen.findByRole('option', { name: 'Asha Rao' });
    fireEvent.change(screen.getByLabelText('Contact'), { target: { value: 'c1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create deal' }));

    expect(await screen.findByText('Delta deal')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('form', { name: 'New deal' })).toBeNull());
  });
});
