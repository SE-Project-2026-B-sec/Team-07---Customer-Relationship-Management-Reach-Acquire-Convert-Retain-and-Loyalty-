import { AppError } from '../../common/errors';
import { campaignMetricsRepository as repo } from './campaign-metrics.repository';
import type { SimulateInput } from './campaign-metrics.schema';
import { notifications } from './notification.service';
import { resolveAudience } from './segments.service';

const SENDABLE = ['DRAFT', 'SCHEDULED'];

async function getCampaign(id: string) {
  const campaign = await repo.findCampaign(id);
  if (!campaign) throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');
  return campaign;
}

/** One decimal place, as a percentage of `of`; 0 when there is nothing to divide by. */
const pct = (part: number, of: number) => (of ? Math.round((part / of) * 1000) / 10 : 0);

export const campaignMetricsService = {
  /**
   * CRM-F-012: "sends" the campaign to everyone in its segment who agreed to marketing,
   * through the notification stub, records a SENT event per contact and marks it Running.
   */
  async send(id: string) {
    const campaign = await getCampaign(id);
    if (!SENDABLE.includes(campaign.status)) {
      throw new AppError(
        409,
        'CAMPAIGN_NOT_SENDABLE',
        `A ${campaign.status.toLowerCase()} campaign cannot be sent`,
      );
    }
    if (!campaign.segmentId) {
      throw new AppError(409, 'NO_SEGMENT', 'Choose a segment for this campaign before sending');
    }
    const contactIds = await resolveAudience(campaign.segmentId);
    if (contactIds.length === 0) {
      throw new AppError(409, 'EMPTY_AUDIENCE', 'This segment has no one to send to');
    }
    await notifications().sendCampaign({
      campaignId: campaign.id,
      campaignName: campaign.name,
      channel: campaign.channel,
      contactIds,
    });
    await repo.markSent(campaign.id, contactIds);
    return { sent: contactIds.length, status: 'RUNNING' as const };
  },

  /** CRM-F-012: recipients, opens, clicks, leads generated and cost per lead. */
  async metrics(id: string) {
    const campaign = await getCampaign(id);
    const [recipients, opens, clicks, leads, sentAt] = await Promise.all([
      repo.countUnique(id, 'SENT'),
      repo.countUnique(id, 'OPEN'),
      repo.countUnique(id, 'CLICK'),
      repo.countLeads(id),
      repo.firstSentAt(id),
    ]);
    const budget = campaign.budget.toNumber();
    return {
      campaignId: id,
      status: campaign.status,
      sentAt,
      recipients,
      opens,
      clicks,
      leads,
      openRate: pct(opens, recipients),
      clickRate: pct(clicks, recipients),
      budget,
      costPerLead: leads ? Math.round((budget / leads) * 100) / 100 : null,
    };
  },

  /**
   * Demo only (no real email provider): makes the campaign show the given number of unique
   * opens and clicks, so the metrics can be demonstrated. Totals only ever go up.
   */
  async simulate(id: string, { opens, clicks }: SimulateInput) {
    const campaign = await getCampaign(id);
    if (campaign.status !== 'RUNNING' && campaign.status !== 'COMPLETED') {
      throw new AppError(409, 'NOT_SENT', 'Send the campaign before recording engagement');
    }
    const recipients = await repo.contactsWith(id, 'SENT');
    if (opens > recipients.length) {
      throw new AppError(400, 'VALIDATION_ERROR', `Only ${recipients.length} people received it`);
    }
    const opened = new Set(await repo.contactsWith(id, 'OPEN'));
    const clicked = new Set(await repo.contactsWith(id, 'CLICK'));
    if (opens < opened.size || clicks < clicked.size) {
      throw new AppError(
        409,
        'CANNOT_REDUCE',
        'Opens and clicks already recorded cannot be removed',
      );
    }

    const newOpens = recipients.filter((c) => !opened.has(c)).slice(0, opens - opened.size);
    await repo.addEvents(id, newOpens, 'OPEN');
    const openers = [...opened, ...newOpens];
    const newClicks = openers.filter((c) => !clicked.has(c)).slice(0, clicks - clicked.size);
    await repo.addEvents(id, newClicks, 'CLICK');
    return this.metrics(id);
  },

  /** Ends a running campaign. */
  async complete(id: string) {
    const campaign = await getCampaign(id);
    if (campaign.status !== 'RUNNING') {
      throw new AppError(409, 'NOT_RUNNING', 'Only a running campaign can be completed');
    }
    await repo.setStatus(id, 'COMPLETED');
    return this.metrics(id);
  },
};
