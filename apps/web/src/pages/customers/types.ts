export type Tier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';

export const TIER_LABEL: Record<Tier, string> = {
  BRONZE: 'Bronze',
  SILVER: 'Silver',
  GOLD: 'Gold',
  PLATINUM: 'Platinum',
};

export const TIER_STYLE: Record<Tier, string> = {
  BRONZE: 'bg-orange-100 text-orange-900',
  SILVER: 'bg-slate-200 text-slate-800',
  GOLD: 'bg-yellow-100 text-yellow-900',
  PLATINUM: 'bg-indigo-100 text-indigo-900',
};

export type TimelineKind = 'DEAL' | 'ORDER' | 'TICKET' | 'ACTIVITY' | 'POINTS' | 'CAMPAIGN';

export const TIMELINE_KINDS: TimelineKind[] = [
  'DEAL',
  'ORDER',
  'TICKET',
  'ACTIVITY',
  'POINTS',
  'CAMPAIGN',
];

/** Plural names for the filter buttons. */
export const KIND_FILTER_LABEL: Record<TimelineKind, string> = {
  DEAL: 'Deals',
  ORDER: 'Orders',
  TICKET: 'Tickets',
  ACTIVITY: 'Activities',
  POINTS: 'Points',
  CAMPAIGN: 'Campaigns',
};

/** Singular names for the badge on each timeline row. */
export const KIND_BADGE_LABEL: Record<TimelineKind, string> = {
  DEAL: 'Deal',
  ORDER: 'Order',
  TICKET: 'Ticket',
  ACTIVITY: 'Activity',
  POINTS: 'Points',
  CAMPAIGN: 'Campaign',
};

export const KIND_STYLE: Record<TimelineKind, string> = {
  DEAL: 'bg-blue-100 text-blue-900',
  ORDER: 'bg-emerald-100 text-emerald-900',
  TICKET: 'bg-red-100 text-red-900',
  ACTIVITY: 'bg-slate-100 text-slate-800',
  POINTS: 'bg-amber-100 text-amber-900',
  CAMPAIGN: 'bg-purple-100 text-purple-900',
};

export interface TimelineItem {
  id: string;
  kind: TimelineKind;
  at: string;
  title: string;
  detail: string | null;
  amount: number | null;
}

export interface Customer360 {
  profile: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    city: string | null;
    tags: string[];
    marketingConsent: boolean;
    tier: Tier;
    isChurnRisk: boolean;
    referralCode: string;
    createdAt: string;
    account: { id: string; name: string; industry: string | null; city: string | null } | null;
    ownerName: string | null;
    pointsBalance: number;
  };
  summary: {
    deals: number;
    orders: number;
    tickets: number;
    openTickets: number;
    activities: number;
    campaignTouches: number;
    totalSpent: number;
  };
  timeline: TimelineItem[];
  truncated: boolean;
}

export interface CustomerRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  tier: Tier;
}

/** The contacts API; its list may come back as `items` or `data`, so both are accepted. */
export interface CustomersPageData {
  items?: CustomerRow[];
  data?: CustomerRow[];
  total: number;
  page: number;
  pageSize: number;
}

export const formatRupees = (n: number) =>
  `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' });

/** CRM-27: GET /customers/:id/referrals */
export interface CustomerReferrals {
  contactId: string;
  referralCode: string;
  bonusPerReferral: number;
  bonusEarned: number;
  referredBy: { id: string; name: string; referredAt: string } | null;
  referrals: {
    id: string;
    customerId: string;
    customerName: string;
    bonusAwarded: boolean;
    referredAt: string;
  }[];
}
