/** CRM-20 lead scoring: shared types and labels for the Leads page. */

export const SCORE_FIELDS = [
  'source',
  'status',
  'phone',
  'company',
  'campaign',
  'activities',
] as const;
export type ScoreField = (typeof SCORE_FIELDS)[number];

export type RuleMatch = { equals: string } | { present: true } | { min: number };

export interface ScoreRule {
  field: ScoreField;
  match: RuleMatch;
  points: number;
  isActive: boolean;
}

export const FIELD_LABEL: Record<ScoreField, string> = {
  source: 'Source is',
  status: 'Status is',
  phone: 'Has a phone number',
  company: 'Has a company',
  campaign: 'Came from a campaign',
  activities: 'Activities logged, at least',
};

/** The kind of value each field needs, and a sensible starting value. */
export const defaultMatch = (field: ScoreField): RuleMatch => {
  if (field === 'source') return { equals: 'REFERRAL' };
  if (field === 'status') return { equals: 'QUALIFIED' };
  if (field === 'activities') return { min: 2 };
  return { present: true };
};

export type Heat = 'Hot' | 'Warm' | 'Cold';

/** 70+ is hot, 40–69 warm, below 40 cold. */
export const heatOf = (score: number): Heat =>
  score >= 70 ? 'Hot' : score >= 40 ? 'Warm' : 'Cold';

export const HEAT_STYLE: Record<Heat, string> = {
  Hot: 'bg-red-50 text-red-800',
  Warm: 'bg-amber-50 text-amber-800',
  Cold: 'bg-slate-100 text-slate-700',
};
