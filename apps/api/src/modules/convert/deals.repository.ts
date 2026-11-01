import type { Prisma } from '@prisma/client';
import { prisma } from '../../common/prisma';

export const dealInclude = {
  contact: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true } },
} satisfies Prisma.DealInclude;

export type DealRow = Prisma.DealGetPayload<{ include: typeof dealInclude }>;

export const dealsRepository = {
  async list(where: Prisma.DealWhereInput, page: { skip: number; take: number }) {
    const [rows, total] = await prisma.$transaction([
      prisma.deal.findMany({
        where,
        include: dealInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...page,
      }),
      prisma.deal.count({ where }),
    ]);
    return { rows, total };
  },

  findById: (id: string) => prisma.deal.findUnique({ where: { id }, include: dealInclude }),

  findContact: (id: string) =>
    prisma.contact.findUnique({ where: { id }, select: { id: true, accountId: true } }),

  searchContacts: (search?: string) =>
    prisma.contact.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {},
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
      take: 20,
    }),

  create: (data: Prisma.DealUncheckedCreateInput) =>
    prisma.deal.create({ data, include: dealInclude }),

  update: (id: string, data: Prisma.DealUncheckedUpdateInput) =>
    prisma.deal.update({ where: { id }, data, include: dealInclude }),
};
