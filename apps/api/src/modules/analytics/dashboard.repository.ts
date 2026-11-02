import { DealStage, LeadStatus } from '@prisma/client';
import { prisma } from '../../common/prisma';

export const dashboardRepository = {
  countLeads: (from: Date, to: Date, convertedOnly = false) =>
    prisma.lead.count({
      where: {
        createdAt: { gte: from, lte: to },
        ...(convertedOnly ? { status: LeadStatus.CONVERTED } : {}),
      },
    }),

  /** Deals created in the range that are still open. */
  openPipeline: (from: Date, to: Date) =>
    prisma.deal.aggregate({
      where: {
        createdAt: { gte: from, lte: to },
        stage: { notIn: [DealStage.WON, DealStage.LOST] },
      },
      _sum: { value: true },
      _count: { _all: true },
    }),

  wonRevenue: (from: Date, to: Date) =>
    prisma.deal.aggregate({
      where: { stage: DealStage.WON, wonAt: { gte: from, lte: to } },
      _sum: { value: true },
      _count: { _all: true },
    }),

  /** One row per customer who placed an order in the range. */
  customersWhoOrdered: (from: Date, to: Date) =>
    prisma.order.groupBy({
      by: ['contactId'],
      where: { orderedAt: { gte: from, lte: to } },
    }),

  /** Each given customer's order count and total, from the beginning up to the end of the range. */
  lifetimeTotals: (contactIds: string[], to: Date) =>
    prisma.order.groupBy({
      by: ['contactId'],
      where: { contactId: { in: contactIds }, orderedAt: { lte: to } },
      _sum: { amount: true },
      _count: { _all: true },
    }),

  churnRiskCount: () => prisma.contact.count({ where: { isChurnRisk: true } }),

  /** One row per customer with a points entry in the range. */
  loyaltyMembers: (from: Date, to: Date) =>
    prisma.pointsLedger.groupBy({
      by: ['contactId'],
      where: { createdAt: { gte: from, lte: to } },
    }),
};
