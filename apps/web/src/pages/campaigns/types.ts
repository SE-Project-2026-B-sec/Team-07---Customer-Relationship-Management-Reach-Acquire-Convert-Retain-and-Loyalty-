export const CHANNELS = ['EMAIL', 'SMS', 'SOCIAL'] as const;
export type Channel = (typeof CHANNELS)[number];

export const CAMPAIGN_STATUSES = [
  'DRAFT',
  'SCHEDULED',
  'RUNNING',
  'COMPLETED',
  'ARCHIVED',
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/** Only these can be edited. The API answers 409 for the others. */
export const EDITABLE_STATUSES: CampaignStatus[] = ['DRAFT', 'SCHEDULED'];

export const CHANNEL_LABEL: Record<Channel, string> = {
  EMAIL: 'Email',
  SMS: 'SMS',
  SOCIAL: 'Social media',
};

export const STATUS_LABEL: Record<CampaignStatus, string> = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  RUNNING: 'Running',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
};

export const STATUS_STYLE: Record<CampaignStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-800',
  SCHEDULED: 'bg-blue-100 text-blue-900',
  RUNNING: 'bg-green-100 text-green-900',
  COMPLETED: 'bg-emerald-100 text-emerald-900',
  ARCHIVED: 'bg-zinc-200 text-zinc-800',
};

export interface Campaign {
  id: string;
  name: string;
  channel: Channel;
  budget: number;
  status: CampaignStatus;
  startDate: string;
  endDate: string;
  segmentId: string | null;
  segmentName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignsPage {
  data: Campaign[];
  page: number;
  pageSize: number;
  total: number;
}

export interface SegmentOption {
  id: string;
  name: string;
}

export const formatRupees = (n: number) =>
  `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Dates are saved as calendar days (UTC midnight), so they are shown in UTC too. */
export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

export const dateInputValue = (iso: string) => iso.slice(0, 10);

/** CRM-19: GET /campaigns/:id/metrics */
export interface CampaignMetrics {
  campaignId: string;
  status: CampaignStatus;
  sentAt: string | null;
  recipients: number;
  opens: number;
  clicks: number;
  leads: number;
  openRate: number;
  clickRate: number;
  budget: number;
  costPerLead: number | null;
}

/** Campaigns that have been sent, or may have been, so have results to show. */
export const HAS_RESULTS: CampaignStatus[] = ['RUNNING', 'COMPLETED', 'ARCHIVED'];
