// CRM-30 (CRM-F-034): quotes from a deal, with line items, a discount and a total,
// downloadable as a PDF. Same access as deals: Admin, Sales Manager, and a Sales Rep
// only for their own deals.
import { AppError } from '../../common/errors';
import { assertCanModify, type AuthUser } from '../auth';
import { renderQuotePdf } from './quotes.pdf';
import { quotesRepository as repo } from './quotes.repository';
import type { CreateQuoteInput, QuoteItem } from './quotes.schema';
import { quoteTotals } from './quotes.totals';

export const QUOTE_VALID_DAYS = 30;

type QuoteRow = {
  id: string;
  dealId: string;
  lineItemsJson: unknown;
  discountPct: { toNumber(): number };
  createdAt: Date;
};

/** A short, readable quote number, e.g. Q-20261106-3F2A. */
export const quoteNumber = (q: { id: string; createdAt: Date }) =>
  `Q-${q.createdAt.toISOString().slice(0, 10).replace(/-/g, '')}-${q.id.slice(0, 4).toUpperCase()}`;

const validUntil = (created: Date) => new Date(created.getTime() + QUOTE_VALID_DAYS * 86_400_000);

function toDto(q: QuoteRow) {
  const totals = quoteTotals(q.lineItemsJson as QuoteItem[], q.discountPct.toNumber());
  return {
    id: q.id,
    number: quoteNumber(q),
    dealId: q.dealId,
    items: totals.lines,
    subtotal: totals.subtotal,
    discountPct: totals.discountPct,
    discount: totals.discount,
    total: totals.total,
    createdAt: q.createdAt,
    validUntil: validUntil(q.createdAt),
  };
}

async function dealFor(user: AuthUser, dealId: string) {
  const deal = await repo.findDeal(dealId);
  if (!deal) throw new AppError(404, 'DEAL_NOT_FOUND', 'Deal not found');
  assertCanModify(user, deal.ownerId);
  return deal;
}

export const quotesService = {
  async create(user: AuthUser, dealId: string, input: CreateQuoteInput) {
    await dealFor(user, dealId);
    const totals = quoteTotals(input.items, input.discountPct);
    const quote = await repo.create({
      dealId,
      lineItemsJson: input.items,
      discountPct: input.discountPct,
      total: totals.total,
    });
    return toDto(quote);
  },

  async list(user: AuthUser, dealId: string) {
    await dealFor(user, dealId);
    return (await repo.listForDeal(dealId)).map(toDto);
  },

  /** The PDF file and its file name. */
  async pdf(user: AuthUser, quoteId: string) {
    const quote = await repo.findWithDeal(quoteId);
    if (!quote) throw new AppError(404, 'QUOTE_NOT_FOUND', 'Quote not found');
    assertCanModify(user, quote.deal.ownerId);

    const dto = toDto(quote);
    const { deal } = quote;
    const file = await renderQuotePdf({
      ...quoteTotals(quote.lineItemsJson as QuoteItem[], dto.discountPct),
      number: dto.number,
      date: quote.createdAt,
      validUntil: dto.validUntil,
      dealTitle: deal.title,
      preparedBy: deal.owner,
      customer: { ...deal.contact, company: deal.account?.name ?? null },
    });
    return { file, fileName: `${dto.number}.pdf` };
  },
};
