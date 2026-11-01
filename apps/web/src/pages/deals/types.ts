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
