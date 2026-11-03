import type { Prisma } from '@prisma/client';
import { prisma } from '../../common/prisma';

const contactFields = {
  id: true,
  name: true,
  email: true,
  city: true,
  tier: true,
  tags: true,
} satisfies Prisma.ContactSelect;

export const segmentsRepository = {
  async list(page: { skip: number; take: number }) {
    const [rows, total] = await prisma.$transaction([
      prisma.segment.findMany({
        include: { _count: { select: { campaigns: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...page,
      }),
      prisma.segment.count(),
    ]);
    return { rows, total };
  },

  findById: (id: string) =>
    prisma.segment.findUnique({
      where: { id },
      include: { _count: { select: { campaigns: true } } },
    }),

  create: (data: Prisma.SegmentCreateInput) =>
    prisma.segment.create({ data, include: { _count: { select: { campaigns: true } } } }),

  update: (id: string, data: Prisma.SegmentUpdateInput) =>
    prisma.segment.update({
      where: { id },
      data,
      include: { _count: { select: { campaigns: true } } },
    }),

  countContacts: (where: Prisma.ContactWhereInput) => prisma.contact.count({ where }),

  async listContacts(where: Prisma.ContactWhereInput, page: { skip: number; take: number }) {
    const [rows, total] = await prisma.$transaction([
      prisma.contact.findMany({
        where,
        select: contactFields,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        ...page,
      }),
      prisma.contact.count({ where }),
    ]);
    return { rows, total };
  },

  /** Every matching contact id, for sending a campaign (CRM-19). */
  allContactIds: async (where: Prisma.ContactWhereInput) =>
    (await prisma.contact.findMany({ where, select: { id: true } })).map((c) => c.id),
};
