import type { QuoteItem } from './quotes.schema';

/**
 * CRM-F-034: quote totals. All sums are done in whole paise so rupee amounts never pick up
 * floating-point errors (0.1 + 0.2 problems), then turned back into rupees.
 */
export function quoteTotals(items: QuoteItem[], discountPct: number) {
  const lines = items.map((item) => {
    const amountPaise = item.quantity * Math.round(item.unitPrice * 100);
    return { ...item, amount: amountPaise / 100, amountPaise };
  });
  const subtotalPaise = lines.reduce((sum, l) => sum + l.amountPaise, 0);
  const discountPaise = Math.round((subtotalPaise * discountPct) / 100);
  const totalPaise = subtotalPaise - discountPaise;
  return {
    lines: lines.map(({ amountPaise: _paise, ...l }) => l),
    subtotal: subtotalPaise / 100,
    discountPct,
    discount: discountPaise / 100,
    total: totalPaise / 100,
  };
}

export type QuoteTotals = ReturnType<typeof quoteTotals>;
