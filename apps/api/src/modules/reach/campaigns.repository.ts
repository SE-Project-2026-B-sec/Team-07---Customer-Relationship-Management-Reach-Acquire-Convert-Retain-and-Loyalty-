import type { Prisma } from '@prisma/client';
import { prisma } from '../../common/prisma';

const include = { segment: { select: { id: true, name: true } } } satisfies Prisma.CampaignInclude;

export type CampaignRow = Prisma.CampaignGetPayload<{ include: typeof include }>;

export const campaignsRepository = {
  async list(where: Prisma.CampaignWhereInput, page: { skip: number; take: number }) {
    const [rows, total] = await prisma.$transaction([
      prisma.campaign.findMany({
        where,
        include,
        orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
        ...page,
      }),
      prisma.campaign.count({ where }),
    ]);
    return { rows, total };
  },

  findById: (id: string) => prisma.campaign.findUnique({ where: { id }, include }),

  segmentExists: async (id: string) => (await prisma.segment.count({ where: { id } })) > 0,

  create: (data: Prisma.CampaignUncheckedCreateInput) => prisma.campaign.create({ data, include }),

  update: (id: string, data: Prisma.CampaignUncheckedUpdateInput) =>
    prisma.campaign.update({ where: { id }, data, include }),
};
