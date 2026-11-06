import { z } from 'zod';

/**
 * CRM-F-022: what a rule can look at, and how it matches.
 *   source / status : { equals: "REFERRAL" }     the lead's source or status is exactly this
 *   phone / company / campaign : { present: true } the lead has a phone, company or campaign
 *   activities     : { min: 2 }                  engagement: at least N calls/meetings/tasks/notes logged
 */
export const SCORE_FIELDS = [
  'source',
  'status',
  'phone',
  'company',
  'campaign',
  'activities',
] as const;
export type ScoreField = (typeof SCORE_FIELDS)[number];

const EQUALS_FIELDS: ScoreField[] = ['source', 'status'];
const PRESENT_FIELDS: ScoreField[] = ['phone', 'company', 'campaign'];

export const matchSchema = z.union([
  z.object({ equals: z.string().trim().min(1).max(40) }).strict(),
  z.object({ present: z.literal(true) }).strict(),
  z.object({ min: z.number().int().min(1).max(100) }).strict(),
]);
export type RuleMatch = z.infer<typeof matchSchema>;

export const ruleSchema = z
  .object({
    field: z.enum(SCORE_FIELDS),
    match: matchSchema,
    points: z.number().int().min(-100).max(100),
    isActive: z.boolean().default(true),
  })
  .refine(
    (r) =>
      ('equals' in r.match && EQUALS_FIELDS.includes(r.field)) ||
      ('present' in r.match && PRESENT_FIELDS.includes(r.field)) ||
      ('min' in r.match && r.field === 'activities'),
    { message: 'This kind of match does not fit this field', path: ['match'] },
  );
export type ScoreRule = z.infer<typeof ruleSchema>;

export const replaceRulesSchema = z.object({ rules: z.array(ruleSchema).max(50) });

/** The facts about a lead that rules can look at. */
export interface ScoringInput {
  source: string;
  status: string;
  phone: string | null;
  company: string | null;
  campaignId: string | null;
  activityCount: number;
}

export function ruleMatches(rule: ScoreRule, lead: ScoringInput): boolean {
  const m = rule.match;
  switch (rule.field) {
    case 'source':
      return 'equals' in m && lead.source.toUpperCase() === m.equals.toUpperCase();
    case 'status':
      return 'equals' in m && lead.status.toUpperCase() === m.equals.toUpperCase();
    case 'phone':
      return 'present' in m && Boolean(lead.phone?.trim());
    case 'company':
      return 'present' in m && Boolean(lead.company?.trim());
    case 'campaign':
      return 'present' in m && Boolean(lead.campaignId);
    case 'activities':
      return 'min' in m && lead.activityCount >= m.min;
  }
}

/** Adds up the points of every active rule the lead matches, kept between 0 and 100. */
export function computeScore(lead: ScoringInput, rules: ScoreRule[]): number {
  const total = rules
    .filter((r) => r.isActive && ruleMatches(r, lead))
    .reduce((sum, r) => sum + r.points, 0);
  return Math.max(0, Math.min(100, total));
}

/** Reads a stored rule row; anything that no longer fits the rules above is skipped. */
export function readRule(row: {
  field: string;
  matchJson: unknown;
  points: number;
  isActive: boolean;
}): ScoreRule | null {
  const parsed = ruleSchema.safeParse({
    field: row.field,
    match: row.matchJson,
    points: row.points,
    isActive: row.isActive,
  });
  return parsed.success ? parsed.data : null;
}
