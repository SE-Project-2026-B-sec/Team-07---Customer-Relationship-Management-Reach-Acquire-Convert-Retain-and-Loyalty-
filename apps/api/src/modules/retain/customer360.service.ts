import type { ActivityType, CampaignEventType, LedgerReason } from '@prisma/client';
import { AppError } from '../../common/errors';
import { customer360Repository as repo } from './customer360.repository';
import type { Customer360Query } from './customer360.schema';

export type TimelineKind = 'DEAL' | 'ORDER' | 'TICKET' | 'ACTIVITY' | 'POINTS' | 'CAMPAIGN';

export interface TimelineItem {
  id: string;
  kind: TimelineKind;
  at: Date;
  title: string;
  detail: string | null;
  /** Money in rupees, for deals and orders. */
  amount: number | null;
}

const ACTIVITY_LABEL: Record<ActivityType, string> = {
  TASK: 'Task',
  CALL: 'Call',
  MEETING: 'Meeting',
  NOTE: 'Note',
};
const EVENT_LABEL: Record<CampaignEventType, string> = {
  SENT: 'sent',
  OPEN: 'opened',
  CLICK: 'clicked',
};
const POINTS_LABEL: Record<LedgerReason, string> = {
  EARN: 'Points earned',
  REDEEM: 'Points redeemed',
  REFERRAL: 'Referral bonus',
  ADJUST: 'Points adjusted',
};
const words = (value: string) => value.replace(/_/g, ' ').toLowerCase();

export const customer360Service = {
  async get(contactId: string, query: Customer360Query) {
    const { limit } = query;
    const contact = await repo.findContact(contactId, limit);
    if (!contact) throw new AppError(404, 'NOT_FOUND', 'Customer not found');

    const [activities, activityCount, openTickets, latest, spent] = await Promise.all([
      repo.activities(contactId, limit),
      repo.activityCount(contactId),
      repo.openTicketCount(contactId),
      repo.latestBalance(contactId),
      repo.totalSpent(contactId),
    ]);

    const items: TimelineItem[] = [];

    for (const deal of contact.deals) {
      const amount = deal.value.toNumber();
      items.push({
        id: `deal:${deal.id}`,
        kind: 'DEAL',
        at: deal.createdAt,
        title: `Deal created: ${deal.title}`,
        detail: `Now in ${words(deal.stage)}`,
        amount,
      });
      if (deal.wonAt) {
        items.push({
          id: `deal-won:${deal.id}`,
          kind: 'DEAL',
          at: deal.wonAt,
          title: `Deal won: ${deal.title}`,
          detail: null,
          amount,
        });
      }
    }

    for (const order of contact.orders) {
      items.push({
        id: `order:${order.id}`,
        kind: 'ORDER',
        at: order.orderedAt,
        title: `Order ${order.orderNo}`,
        detail: order.dealId ? 'Linked to a deal' : null,
        amount: order.amount.toNumber(),
      });
    }

    for (const ticket of contact.tickets) {
      items.push({
        id: `ticket:${ticket.id}`,
        kind: 'TICKET',
        at: ticket.createdAt,
        title: `Ticket opened: ${ticket.subject}`,
        detail: `${words(ticket.priority)} priority`,
        amount: null,
      });
      if (ticket.resolvedAt) {
        items.push({
          id: `ticket-resolved:${ticket.id}`,
          kind: 'TICKET',
          at: ticket.resolvedAt,
          title: `Ticket resolved: ${ticket.subject}`,
          detail: null,
          amount: null,
        });
      }
    }

    for (const activity of activities) {
      items.push({
        id: `activity:${activity.id}`,
        kind: 'ACTIVITY',
        at: activity.createdAt,
        title: `${ACTIVITY_LABEL[activity.type]}: ${activity.subject}`,
        detail: `Logged by ${activity.user.name}${activity.done ? ' (done)' : ''}`,
        amount: null,
      });
    }

    for (const row of contact.ledger) {
      const sign = row.delta > 0 ? '+' : '';
      items.push({
        id: `points:${row.id}`,
        kind: 'POINTS',
        at: row.createdAt,
        title: `${POINTS_LABEL[row.reason]}: ${sign}${row.delta} points`,
        detail: `Balance ${row.balanceAfter}`,
        amount: null,
      });
    }

    for (const event of contact.campaignEvents) {
      items.push({
        id: `campaign:${event.id}`,
        kind: 'CAMPAIGN',
        at: event.occurredAt,
        title: `Campaign ${EVENT_LABEL[event.type]}: ${event.campaign.name}`,
        detail: null,
        amount: null,
      });
    }

    // Newest first; the id breaks ties so the order is always the same.
    items.sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id));

    const counts = contact._count;
    const truncated =
      counts.deals > limit ||
      counts.orders > limit ||
      counts.tickets > limit ||
      counts.ledger > limit ||
      counts.campaignEvents > limit ||
      activityCount > limit;

    return {
      profile: {
        id: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        city: contact.city,
        tags: contact.tags,
        marketingConsent: contact.marketingConsent,
        tier: contact.tier,
        isChurnRisk: contact.isChurnRisk,
        referralCode: contact.referralCode,
        createdAt: contact.createdAt,
        account: contact.account,
        ownerName: contact.owner?.name ?? null,
        pointsBalance: latest?.balanceAfter ?? 0,
      },
      summary: {
        deals: counts.deals,
        orders: counts.orders,
        tickets: counts.tickets,
        openTickets,
        activities: activityCount,
        campaignTouches: counts.campaignEvents,
        totalSpent: spent ? spent.toNumber() : 0,
      },
      timeline: items.slice(0, limit),
      truncated,
    };
  },
};
