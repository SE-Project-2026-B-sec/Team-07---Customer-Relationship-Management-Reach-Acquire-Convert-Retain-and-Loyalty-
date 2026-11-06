import type { Prisma } from '@prisma/client';
import { prisma } from '../../common/prisma';
import {
  computeScore,
  readRule,
  SCORE_FIELDS,
  type ScoreRule,
  type ScoringInput,
} from './lead-scoring.rules';

const leadFacts = {
  id: true,
  source: true,
  status: true,
  phone: true,
  company: true,
  campaignId: true,
  _count: { select: { activities: true } },
} satisfies Prisma.LeadSelect;

type LeadFacts = Prisma.LeadGetPayload<{ select: typeof leadFacts }>;

const toInput = (l: LeadFacts): ScoringInput => ({
  source: l.source,
  status: l.status,
  phone: l.phone,
  company: l.company,
  campaignId: l.campaignId,
  activityCount: l._count.activities,
});

/**
 * The rules in use, in a fixed order (by condition, then most points first) so the list looks
 * the same every time. Rows that no longer make sense are skipped.
 */
export async function loadRules(): Promise<ScoreRule[]> {
  const rows = await prisma.leadScoreRule.findMany();
  return rows
    .map(readRule)
    .filter((r): r is ScoreRule => r !== null)
    .sort(
      (a, b) =>
        SCORE_FIELDS.indexOf(a.field) - SCORE_FIELDS.indexOf(b.field) || b.points - a.points,
    );
}

/** Score for a lead that is about to be created (it has no activities yet). */
export async function scoreNewLead(lead: Omit<ScoringInput, 'activityCount'>) {
  return computeScore({ ...lead, activityCount: 0 }, await loadRules());
}

/**
 * Re-scores one lead and saves it if the score changed (CRM-F-022: "recompute when the lead
 * changes"). Called after a lead is edited and after an activity is logged on it.
 */
export async function rescoreLead(leadId: string): Promise<number | null> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: leadFacts });
  if (!lead) return null;
  const score = computeScore(toInput(lead), await loadRules());
  await prisma.lead.update({ where: { id: leadId }, data: { score } });
  return score;
}

/** Re-scores every lead, e.g. after the rules change. Returns how many scores changed. */
export async function rescoreAllLeads(): Promise<number> {
  const rules = await loadRules();
  const leads = await prisma.lead.findMany({ select: { ...leadFacts, score: true } });
  const changed = leads
    .map((l) => ({ id: l.id, old: l.score, score: computeScore(toInput(l), rules) }))
    .filter((l) => l.score !== l.old);
  await prisma.$transaction(
    changed.map((l) => prisma.lead.update({ where: { id: l.id }, data: { score: l.score } })),
  );
  return changed.length;
}

export const leadScoringService = {
  rules: loadRules,

  /** Replaces the whole rule set in one go, then re-scores every lead. */
  async replaceRules(rules: ScoreRule[]) {
    await prisma.$transaction([
      prisma.leadScoreRule.deleteMany(),
      prisma.leadScoreRule.createMany({
        data: rules.map((r) => ({
          field: r.field,
          matchJson: r.match,
          points: r.points,
          isActive: r.isActive,
        })),
      }),
    ]);
    return { rules: await loadRules(), rescored: await rescoreAllLeads() };
  },

  async rescoreAll() {
    return { rescored: await rescoreAllLeads() };
  },
};
