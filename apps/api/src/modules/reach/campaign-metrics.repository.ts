import type { CampaignEventType } from '@prisma/client';
import { prisma } from '../../common/prisma';

export const campaignMetricsRepository = {
  findCampaign: (id: string) =>
    prisma.campaign.findUnique({
      where: { id },
      select: { id: true, name: true, channel: true, status: true, budget: true, segmentId: true },
    }),

  /** Contact ids with at least one event of this type, in a fixed order. */
  async contactsWith(campaignId: string, type: CampaignEventType) {
    const rows = await prisma.campaignEvent.findMany({
      where: { campaignId, type },
      distinct: ['contactId'],
      select: { contactId: true },
      orderBy: { contactId: 'asc' },
    });
    return rows.map((r) => r.contactId);
  },

  countUnique: async (campaignId: string, type: CampaignEventType) =>
    (
      await prisma.campaignEvent.findMany({
        where: { campaignId, type },
        distinct: ['contactId'],
        select: { contactId: true },
      })
    ).length,

  firstSentAt: async (campaignId: string) =>
    (
      await prisma.campaignEvent.findFirst({
        where: { campaignId, type: 'SENT' },
        orderBy: { occurredAt: 'asc' },
        select: { occurredAt: true },
      })
    )?.occurredAt ?? null,

  countLeads: (campaignId: string) => prisma.lead.count({ where: { campaignId } }),

  /** Records the send and marks the campaign Running, all or nothing. */
  markSent: (campaignId: string, contactIds: string[]) =>
    prisma.$transaction([
      prisma.campaignEvent.createMany({
        data: contactIds.map((contactId) => ({ campaignId, contactId, type: 'SENT' as const })),
      }),
      prisma.campaign.update({ where: { id: campaignId }, data: { status: 'RUNNING' } }),
    ]),

  addEvents: (campaignId: string, contactIds: string[], type: 'OPEN' | 'CLICK') =>
    prisma.campaignEvent.createMany({
      data: contactIds.map((contactId) => ({ campaignId, contactId, type })),
    }),

  setStatus: (id: string, status: 'COMPLETED') =>
    prisma.campaign.update({ where: { id }, data: { status } }),
};
