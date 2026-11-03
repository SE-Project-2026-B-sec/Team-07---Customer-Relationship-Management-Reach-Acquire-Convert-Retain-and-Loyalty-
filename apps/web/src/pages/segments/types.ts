export const TIERS = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_LABEL: Record<Tier, string> = {
  BRONZE: 'Bronze',
  SILVER: 'Silver',
  GOLD: 'Gold',
  PLATINUM: 'Platinum',
};

/** Same shape as the API's segment filter (CRM-17). Every rule is optional. */
export interface SegmentFilter {
  cities?: string[];
  tiers?: Tier[];
  tags?: string[];
  orderedWithinDays?: number;
  noOrderForDays?: number;
}

export interface Segment {
  id: string;
  name: string;
  filter: SegmentFilter;
  summary: string;
  audienceSize: number;
  campaignCount: number;
  createdAt: string;
}

export interface SegmentsPage {
  data: Segment[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AudienceContact {
  id: string;
  name: string;
  email: string;
  city: string | null;
  tier: Tier;
}

export interface Preview {
  audienceSize: number;
  sample: AudienceContact[];
  summary: string;
}

/** "Bengaluru, mumbai ,, Pune" -> ["Bengaluru", "mumbai", "Pune"] */
export const splitList = (text: string) =>
  text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
