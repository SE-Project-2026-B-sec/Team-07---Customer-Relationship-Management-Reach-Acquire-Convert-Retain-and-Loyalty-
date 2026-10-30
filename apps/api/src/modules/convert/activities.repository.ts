import type { Prisma } from '@prisma/client';
import { prisma } from '../../common/prisma';

export const activityInclude = {
  user: { select: { id: true, name: true } },
  lead: { select: { id: true, name: true } },
  contact: { select: { id: true, name: true } },
  deal: { select: { id: true, title: true } },
} satisfies Prisma.ActivityInclude;

export type ActivityRow = Prisma.ActivityGetPayload<{ include: typeof activityInclude }>;

export const activitiesRepository = {
  async list(where: Prisma.ActivityWhereInput, page: { skip: number; take: number }) {
    const [rows, total] = await prisma.$transaction([
      prisma.activity.findMany({
        where,
        include: activityInclude,
        // Open items first, soonest due first, items without a due date last.
        orderBy: [
          { done: 'asc' },
          { dueAt: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'desc' },
          { id: 'asc' },
        ],
        ...page,
      }),
      prisma.activity.count({ where }),
    ]);
    return { rows, total };
  },

  findById: (id: string) => prisma.activity.findUnique({ where: { id }, include: activityInclude }),

  leadExists: async (id: string) => (await prisma.lead.count({ where: { id } })) > 0,
  contactExists: async (id: string) => (await prisma.contact.count({ where: { id } })) > 0,
  dealExists: async (id: string) => (await prisma.deal.count({ where: { id } })) > 0,

  create: (data: Prisma.ActivityUncheckedCreateInput) =>
    prisma.activity.create({ data, include: activityInclude }),

  update: (id: string, data: Prisma.ActivityUncheckedUpdateInput) =>
    prisma.activity.update({ where: { id }, data, include: activityInclude }),
};
