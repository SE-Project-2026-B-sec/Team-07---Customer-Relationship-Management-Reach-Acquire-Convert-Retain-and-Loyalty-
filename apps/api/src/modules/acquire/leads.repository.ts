import type { Prisma } from '@prisma/client';
import { prisma } from '../../common/prisma';

export const leadInclude = {
  owner: { select: { id: true, name: true } },
  campaign: { select: { id: true, name: true } },
} satisfies Prisma.LeadInclude;

export type LeadRow = Prisma.LeadGetPayload<{ include: typeof leadInclude }>;

export const leadsRepository = {
  async list(where: Prisma.LeadWhereInput, page: { skip: number; take: number }) {
    const [rows, total] = await prisma.$transaction([
      prisma.lead.findMany({
        where,
        include: leadInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...page,
      }),
      prisma.lead.count({ where }),
    ]);
    return { rows, total };
  },

  findById: (id: string) => prisma.lead.findUnique({ where: { id }, include: leadInclude }),

  /** True if any other lead or any contact already uses this email (case-insensitive). */
  async emailExists(email: string, excludeLeadId?: string) {
    const match = { equals: email, mode: 'insensitive' as const };
    const [lead, contact] = await Promise.all([
      prisma.lead.findFirst({
        where: { email: match, ...(excludeLeadId ? { id: { not: excludeLeadId } } : {}) },
        select: { id: true },
      }),
      prisma.contact.findFirst({ where: { email: match }, select: { id: true } }),
    ]);
    return Boolean(lead || contact);
  },

  campaignExists: async (id: string) =>
    Boolean(await prisma.campaign.findUnique({ where: { id }, select: { id: true } })),

  create: (data: Prisma.LeadUncheckedCreateInput) =>
    prisma.lead.create({ data, include: leadInclude }),

  update: (id: string, data: Prisma.LeadUncheckedUpdateInput) =>
    prisma.lead.update({ where: { id }, data, include: leadInclude }),
};
