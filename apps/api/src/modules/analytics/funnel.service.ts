// CRM-29: funnel report (CRM-F-061 / TC-ANA-02).
//
// How each stage is counted, for an optional date range (both ends inclusive):
//   Reached    people sent a campaign message in the range (distinct contacts, SENT events)
//   Leads      leads created in the range
//   Qualified  those leads that are now Qualified or Converted
//   Customers  those leads that are now Converted
//   Repeat     converted leads whose customer record has 2 or more orders
// Leads -> Repeat follow one group of leads, so each stage is a subset of the one before.
// Reached is the campaign audience, so it is not a strict superset of Leads.
import type { Prisma } from '@prisma/client';
import { prisma } from '../../common/prisma';
import type { FunnelQuery } from './reports.schema';

export const FUNNEL_STAGES = [
  { key: 'REACHED', label: 'Reached' },
  { key: 'LEADS', label: 'Leads' },
  { key: 'QUALIFIED', label: 'Qualified' },
  { key: 'CUSTOMERS', label: 'Customers' },
  { key: 'REPEAT', label: 'Repeat customers' },
] as const;

/** Orders needed to count as a repeat (loyal) customer. */
export const REPEAT_MIN_ORDERS = 2;

const DAY_MS = 86_400_000;

/** Turns "YYYY-MM-DD" bounds into a [start, end) range in UTC. Missing ends are open. */
export function toRange({ from, to }: FunnelQuery) {
  return {
    start: from ? new Date(`${from}T00:00:00.000Z`) : new Date(0),
    end: to ? new Date(Date.parse(`${to}T00:00:00.000Z`) + DAY_MS) : new Date('9999-12-31'),
  };
}

/** Percentage of `count` relative to `previous`, rounded to 1 decimal; null when previous is 0. */
export const percent = (count: number, previous: number) =>
  previous === 0 ? null : Math.round((count / previous) * 1000) / 10;

export interface FunnelStage {
  key: (typeof FUNNEL_STAGES)[number]['key'];
  label: string;
  count: number;
  /** % of the previous stage that reached this one (null for the first stage). */
  conversionRate: number | null;
  /** % lost since the previous stage (100 - conversionRate). */
  dropOff: number | null;
}

/** Adds conversion and drop-off percentages to raw stage counts. */
export function buildStages(counts: number[]): FunnelStage[] {
  return FUNNEL_STAGES.map((stage, i) => {
    const conversionRate = i === 0 ? null : percent(counts[i], counts[i - 1]);
    return {
      key: stage.key,
      label: stage.label,
      count: counts[i],
      conversionRate,
      dropOff: conversionRate === null ? null : Math.round((100 - conversionRate) * 10) / 10,
    };
  });
}

export const funnelService = {
  async funnel(query: FunnelQuery) {
    const { start, end } = toRange(query);
    const createdInRange: Prisma.LeadWhereInput = { createdAt: { gte: start, lt: end } };

    const [reached, leads, qualified, customers, repeat] = await Promise.all([
      prisma.campaignEvent
        .groupBy({
          by: ['contactId'],
          where: { type: 'SENT', occurredAt: { gte: start, lt: end } },
        })
        .then((groups) => groups.length),
      prisma.lead.count({ where: createdInRange }),
      prisma.lead.count({
        where: { ...createdInRange, status: { in: ['QUALIFIED', 'CONVERTED'] } },
      }),
      prisma.lead.count({ where: { ...createdInRange, status: 'CONVERTED' } }),
      // Parameterised query (CRM-SR-005): counts converted leads whose contact has 2+ orders.
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS count
        FROM "Lead" l
        WHERE l.status = 'CONVERTED'
          AND l."createdAt" >= ${start} AND l."createdAt" < ${end}
          AND l."convertedContactId" IS NOT NULL
          AND (SELECT COUNT(*) FROM "Order" o WHERE o."contactId" = l."convertedContactId")
              >= ${REPEAT_MIN_ORDERS}
      `.then((rows) => Number(rows[0]?.count ?? 0)),
    ]);

    return {
      from: query.from ?? null,
      to: query.to ?? null,
      stages: buildStages([reached, leads, qualified, customers, repeat]),
    };
  },
};
