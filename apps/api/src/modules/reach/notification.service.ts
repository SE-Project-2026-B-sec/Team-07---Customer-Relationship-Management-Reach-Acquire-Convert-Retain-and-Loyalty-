import type { Channel } from '@prisma/client';
import { logger } from '../../common/logger';

/**
 * SAD 3.4 / ADR-5: sending email, SMS or social posts goes through this interface.
 * This release uses a stub that only logs, so no real messages are sent. A real provider
 * (e.g. an email API) can be added later by writing another adapter, without touching campaigns.
 */
export interface NotificationService {
  sendCampaign(input: {
    campaignId: string;
    campaignName: string;
    channel: Channel;
    contactIds: string[];
  }): Promise<{ accepted: number }>;
}

/** Logs what would be sent (counts only, never personal data: CRM-SR-002). */
export const logNotificationService: NotificationService = {
  async sendCampaign({ campaignId, campaignName, channel, contactIds }) {
    logger.info(
      { campaignId, channel, recipients: contactIds.length },
      `Simulated ${channel} send for campaign "${campaignName}"`,
    );
    return { accepted: contactIds.length };
  },
};

let current: NotificationService = logNotificationService;

export const notifications = () => current;

/** Lets tests (or a future real provider) swap the adapter. */
export function setNotificationService(service: NotificationService) {
  current = service;
}
