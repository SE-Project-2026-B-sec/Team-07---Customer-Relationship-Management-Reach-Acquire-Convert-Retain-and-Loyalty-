import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DealsBoard } from './DealsBoard';
import { QuotePanel } from './QuotePanel';
import { quoteTotals, type Deal, type Quote } from './types';

const deal: Deal = {
  id: 'd1',
  title: 'Infosys CRM rollout',
  value: 108000,
  stage: 'PROPOSAL',
  expectedClose: null,
  wonAt: null,
  contactId: 'c1',
  contactName: 'Meera Nair',
  ownerId: 'u1',
  ownerName: 'Sales Rep One',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** A fake quotes API that works out totals the same way the server does. */
function mockServer(options: { refuse?: string } = {}) {
  const saved: Quote[] = [];
  const calls: { method: string; url: string; body?: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });

    if (url.endsWith('/pdf')) {
      return new Response(new Blob(['%PDF-1.3 fake']), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="Q-20261106-ABCD.pdf"',
        },
      });
    }
    if (url.includes('/deals/d1/quotes') && method === 'POST') {
      if (options.refuse) {
        return json({ error: { code: 'FORBIDDEN', message: options.refuse } }, 403);
      }
      const t = quoteTotals(body.items, body.discountPct);
      const quote: Quote = {
        id: `q${saved.length + 1}`,
        number: 'Q-20261106-ABCD',
        dealId: 'd1',
        items: body.items.map((i: Quote['items'][number]) => ({
          ...i,
          amount: i.quantity * i.unitPrice,
        })),
        discountPct: body.discountPct,
        ...t,
        createdAt: '2026-11-06T10:00:00.000Z',
        validUntil: '2026-12-06T10:00:00.000Z',
      };
      saved.unshift(quote);
      return json(quote, 201);
    }
    if (url.includes('/deals/d1/quotes')) return json(saved);
    if (url.includes('/deals')) return json({ data: [deal], page: 1, pageSize: 100, total: 1 });
    return json({}, 404);
  });
  return { saved, calls };
}

const wrap = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {ui}
    </QueryClientProvider>,
  );

function fillItem(i: number, description: string, qty: string, price: string) {
  fireEvent.change(screen.getByLabelText(`Item ${i} description`), {
    target: { value: description },
  });
  const item = screen.getByRole('group', { name: `Item ${i}` });
  fireEvent.change(within(item).getByLabelText('Qty'), { target: { value: qty } });
  fireEvent.change(within(item).getByLabelText('Unit price (₹)'), { target: { value: price } });
}

beforeEach(() => {
  // jsdom has no object URLs; the download helper needs them.
  URL.createObjectURL = vi.fn(() => 'blob:quote');
  URL.revokeObjectURL = vi.fn();
  // jsdom can't follow the download link, so don't let it try.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CRM-30 quotes on a deal', () => {
  it('TC-CONV-08 2 items and 10% discount show the correct total, save, and download as PDF', async () => {
    const { calls } = mockServer();
    wrap(<QuotePanel deal={deal} onClose={() => {}} />);

    fillItem(1, 'Annual CRM licence', '2', '50000');
    fireEvent.click(screen.getByRole('button', { name: '+ Add item' }));
    fillItem(2, 'Onboarding and training', '1', '20000');
    fireEvent.change(screen.getByLabelText('Discount (%)'), { target: { value: '10' } });

    const totals = screen.getByLabelText('Quote totals');
    expect(totals).toHaveTextContent('Subtotal₹1,20,000.00');
    expect(totals).toHaveTextContent('Discount (10%)− ₹12,000.00');
    expect(totals).toHaveTextContent('Total₹1,08,000.00');

    fireEvent.click(screen.getByRole('button', { name: 'Save quote' }));
    const download = await screen.findByRole('button', { name: 'Download Q-20261106-ABCD as PDF' });
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      items: [
        { description: 'Annual CRM licence', quantity: 2, unitPrice: 50000 },
        { description: 'Onboarding and training', quantity: 1, unitPrice: 20000 },
      ],
      discountPct: 10,
    });
    const table = screen.getByRole('table', { name: 'Saved quotes' });
    expect(within(table).getByText('₹1,08,000.00')).toBeInTheDocument();
    // The form is cleared for the next quote.
    expect(screen.getByLabelText('Item 1 description')).toHaveValue('');

    fireEvent.click(download);
    await vi.waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    expect(calls.some((c) => c.url.endsWith('/quotes/q1/pdf'))).toBe(true);
  });

  it('removing an item updates the total', () => {
    mockServer();
    wrap(<QuotePanel deal={deal} onClose={() => {}} />);
    fillItem(1, 'A', '1', '100');
    fireEvent.click(screen.getByRole('button', { name: '+ Add item' }));
    fillItem(2, 'B', '3', '0.10');
    expect(screen.getByLabelText('Quote totals')).toHaveTextContent('Total₹100.30');
    fireEvent.click(screen.getByRole('button', { name: 'Remove item 2' }));
    expect(screen.getByLabelText('Quote totals')).toHaveTextContent('Total₹100.00');
    expect(screen.queryByRole('button', { name: 'Remove item 1' })).not.toBeInTheDocument();
  });

  it('shows the reason when saving is refused', async () => {
    mockServer({ refuse: 'You can only change records assigned to you' });
    wrap(<QuotePanel deal={deal} onClose={() => {}} />);
    fillItem(1, 'A', '1', '100');
    fireEvent.click(screen.getByRole('button', { name: 'Save quote' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You can only change records assigned to you',
    );
  });

  it('the Quote button on a deal card opens the quote panel', async () => {
    mockServer();
    wrap(<DealsBoard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Quotes for Infosys CRM rollout' }));
    expect(
      screen.getByRole('region', { name: 'Quotes for Infosys CRM rollout' }),
    ).toBeInTheDocument();
    // Opening Activities closes the quote panel, so only one panel shows.
    fireEvent.click(screen.getByRole('button', { name: 'Activities for Infosys CRM rollout' }));
    expect(
      screen.queryByRole('region', { name: 'Quotes for Infosys CRM rollout' }),
    ).not.toBeInTheDocument();
  });
});
