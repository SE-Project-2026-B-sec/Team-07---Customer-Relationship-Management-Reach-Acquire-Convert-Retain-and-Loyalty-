export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_SOURCES = ['WEB', 'MANUAL', 'IMPORT', 'REFERRAL', 'CAMPAIGN'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  CONVERTED: 'Converted',
  LOST: 'Lost',
};

export const STATUS_STYLE: Record<LeadStatus, string> = {
  NEW: 'bg-blue-50 text-blue-800',
  CONTACTED: 'bg-amber-50 text-amber-800',
  QUALIFIED: 'bg-green-50 text-green-800',
  CONVERTED: 'bg-slate-200 text-slate-700',
  LOST: 'bg-red-50 text-red-700',
};

export const SOURCE_LABEL: Record<LeadSource, string> = {
  WEB: 'Website',
  MANUAL: 'Manual',
  IMPORT: 'CSV import',
  REFERRAL: 'Referral',
  CAMPAIGN: 'Campaign',
};

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  source: LeadSource;
  status: LeadStatus;
  score: number;
  isDuplicate: boolean;
  ownerId: string | null;
  ownerName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  createdAt: string;
}

export interface LeadsPage {
  data: Lead[];
  page: number;
  pageSize: number;
  total: number;
}
