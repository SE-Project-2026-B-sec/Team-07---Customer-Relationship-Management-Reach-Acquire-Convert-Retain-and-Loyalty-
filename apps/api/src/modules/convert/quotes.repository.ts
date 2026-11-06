import type { Prisma } from '@prisma/client';
import { prisma } from '../../common/prisma';

const dealForQuote = {
  id: true,
  title: true,
  ownerId: true,
  owner: { select: { name: true, email: true } },
  contact: { select: { name: true, email: true, phone: true, city: true } },
  account: { select: { name: true } },
} as const;

export const quotesRepository = {
  findDeal: (id: string) => prisma.deal.findUnique({ where: { id }, select: dealForQuote }),

  listForDeal: (dealId: string) =>
    prisma.quote.findMany({ where: { dealId }, orderBy: { createdAt: 'desc' } }),

  create: (data: Prisma.QuoteUncheckedCreateInput) => prisma.quote.create({ data }),

  findWithDeal: (id: string) =>
    prisma.quote.findUnique({ where: { id }, include: { deal: { select: dealForQuote } } }),
};
