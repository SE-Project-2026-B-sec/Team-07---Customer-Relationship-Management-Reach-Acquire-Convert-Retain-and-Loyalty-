// CRM-23: churn-risk rule (CRM-F-042). Pure function, so the 91/89-day boundary is easy to test.
// A customer is at risk when EITHER:
//   - they have ordered before, but not in the last 90 days, OR
//   - they have 2 or more open (Open / In progress) High or Urgent tickets.
// Someone who has never ordered is not a lapsed customer, so the order rule needs >= 1 order.
// churn.service.ts runs the same rule in SQL for every contact; keep the two in step.
import type { TicketPriority } from '@prisma/client';

export const CHURN_DAYS = 90;
export const MIN_OPEN_HIGH_TICKETS = 2;
export const HIGH_PRIORITIES: TicketPriority[] = ['HIGH', 'URGENT'];

const DAY_MS = 86_400_000;

export type ChurnReason = 'NO_RECENT_ORDER' | 'OPEN_HIGH_TICKETS';

export interface ChurnInput {
  /** Most recent order, or null if the customer has never ordered. */
  lastOrderAt: Date | null;
  /** Open or In progress tickets with High or Urgent priority. */
  openHighTickets: number;
}

/** Orders on or after this moment count as recent. */
export const churnCutoff = (now: Date = new Date()) =>
  new Date(now.getTime() - CHURN_DAYS * DAY_MS);

export function evaluateChurn(input: ChurnInput, now: Date = new Date()) {
  const reasons: ChurnReason[] = [];
  if (input.lastOrderAt && input.lastOrderAt < churnCutoff(now)) reasons.push('NO_RECENT_ORDER');
  if (input.openHighTickets >= MIN_OPEN_HIGH_TICKETS) reasons.push('OPEN_HIGH_TICKETS');
  return { atRisk: reasons.length > 0, reasons };
}
