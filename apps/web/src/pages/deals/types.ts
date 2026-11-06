export const STAGES = [
  'PROSPECTING',
  'QUALIFIED',
  'PROPOSAL',
  'NEGOTIATION',
  'WON',
  'LOST',
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  PROSPECTING: 'Prospecting',
  QUALIFIED: 'Qualified',
  PROPOSAL: 'Proposal',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost',
};

export interface Deal {
  id: string;
  title: string;
  value: number;
  stage: Stage;
  expectedClose: string | null;
  wonAt: string | null;
  contactId: string;
  contactName: string;
  ownerId: string;
  ownerName: string;
}

export interface DealsPage {
  data: Deal[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ContactOption {
  id: string;
  name: string;
  email: string;
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
export const formatInr = (n: number) => inr.format(n);

/** Deals still being worked: everything except Won and Lost. */
export const isOpen = (stage: Stage) => stage !== 'WON' && stage !== 'LOST';

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

/** CRM-30: a quote line as typed into the form. */
export interface QuoteItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
}

/** CRM-30: GET/POST /deals/:id/quotes */
export interface Quote {
  id: string;
  number: string;
  dealId: string;
  items: (QuoteItemInput & { amount: number })[];
  subtotal: number;
  discountPct: number;
  discount: number;
  total: number;
  createdAt: string;
  validUntil: string;
}

const inrExact = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₹1,08,000.00 (quotes show paise). */
export const formatInrExact = (n: number) => inrExact.format(n);

/** Same rule as the API (quotes.totals.ts): add up in whole paise, then round the discount. */
export function quoteTotals(items: QuoteItemInput[], discountPct: number) {
  const subtotalPaise = items.reduce(
    (sum, i) => sum + i.quantity * Math.round(i.unitPrice * 100),
    0,
  );
  const discountPaise = Math.round((subtotalPaise * discountPct) / 100);
  return {
    subtotal: subtotalPaise / 100,
    discount: discountPaise / 100,
    total: (subtotalPaise - discountPaise) / 100,
  };
}
