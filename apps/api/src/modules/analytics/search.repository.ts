// CRM-15: Prisma queries only. Each one returns at most RESULT_LIMIT rows.
import type { Prisma } from '@prisma/client';
import { prisma } from '../../common/prisma';

export const RESULT_LIMIT = 5;

/** Case-insensitive "contains" filter. */
const like = (q: string) => ({ contains: q, mode: 'insensitive' as const });

// `owner` is { ownerId } for a Sales Rep and {} for everyone else (see ownedBy()).
type Owner = { ownerId?: string };

export const searchRepository = {
  leads: (q: string, owner: Owner) =>
    prisma.lead.findMany({
      where: { ...owner, OR: [{ name: like(q) }, { email: like(q) }] },
      select: { id: true, name: true, email: true, status: true },
      orderBy: { name: 'asc' },
      take: RESULT_LIMIT,
    }),

  contacts: (q: string, owner: Owner) =>
    prisma.contact.findMany({
      where: { ...owner, OR: [{ name: like(q) }, { email: like(q) }, { phone: like(q) }] },
      select: { id: true, name: true, email: true, phone: true },
      orderBy: { name: 'asc' },
      take: RESULT_LIMIT,
    }),

  accounts: (q: string) =>
    prisma.account.findMany({
      where: { name: like(q) },
      select: { id: true, name: true, industry: true },
      orderBy: { name: 'asc' },
      take: RESULT_LIMIT,
    }),

  // A deal matches by its title, or because it belongs to a matching account
  // (TC-ANA-04: searching an account name returns the account and its deals).
  deals: (q: string, owner: Owner) => {
    const where: Prisma.DealWhereInput = {
      ...owner,
      OR: [{ title: like(q) }, { account: { name: like(q) } }],
    };
    return prisma.deal.findMany({
      where,
      select: { id: true, title: true, stage: true },
      orderBy: { title: 'asc' },
      take: RESULT_LIMIT,
    });
  },

  tickets: (q: string) =>
    prisma.ticket.findMany({
      where: { subject: like(q) },
      select: { id: true, subject: true, status: true },
      orderBy: { createdAt: 'desc' },
      take: RESULT_LIMIT,
    }),
};
