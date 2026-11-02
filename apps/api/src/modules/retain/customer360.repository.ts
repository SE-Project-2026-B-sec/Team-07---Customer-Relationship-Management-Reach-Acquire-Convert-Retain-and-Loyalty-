import type { Prisma } from '@prisma/client';
import { prisma } from '../../common/prisma';

const contactInclude = (limit: number) =>
  ({
    account: { select: { id: true, name: true, industry: true, city: true } },
    owner: { select: { id: true, name: true } },
    deals: { orderBy: { createdAt: 'desc' }, take: limit },
    orders: { orderBy: { orderedAt: 'desc' }, take: limit },
    tickets: { orderBy: { createdAt: 'desc' }, take: limit },
    ledger: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit },
    campaignEvents: {
      orderBy: { occurredAt: 'desc' },
      take: limit,
      include: { campaign: { select: { id: true, name: true } } },
    },
    _count: {
      select: { deals: true, orders: true, tickets: true, ledger: true, campaignEvents: true },
    },
  }) satisfies Prisma.ContactInclude;

/** Activities on the customer, on their deals, or on the lead they were converted from. */
const activityWhere = (contactId: string): Prisma.ActivityWhereInput => ({
  OR: [{ contactId }, { deal: { contactId } }, { lead: { convertedContactId: contactId } }],
});

export const customer360Repository = {
  findContact: (id: string, limit: number) =>
    prisma.contact.findUnique({ where: { id }, include: contactInclude(limit) }),

  activities: (contactId: string, limit: number) =>
    prisma.activity.findMany({
      where: activityWhere(contactId),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: { user: { select: { name: true } } },
    }),

  activityCount: (contactId: string) => prisma.activity.count({ where: activityWhere(contactId) }),

  openTicketCount: (contactId: string) =>
    prisma.ticket.count({ where: { contactId, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),

  /** The points balance is the latest ledger row's balanceAfter (SAD ADR-3). */
  latestBalance: (contactId: string) =>
    prisma.pointsLedger.findFirst({
      where: { contactId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { balanceAfter: true },
    }),

  totalSpent: async (contactId: string) =>
    (await prisma.order.aggregate({ where: { contactId }, _sum: { amount: true } }))._sum.amount,
};

export type ContactRow = NonNullable<Awaited<ReturnType<typeof customer360Repository.findContact>>>;
export type ActivityRow = Awaited<ReturnType<typeof customer360Repository.activities>>[number];
