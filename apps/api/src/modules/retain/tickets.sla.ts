// CRM-21: SLA rules for tickets (CRM-F-040). Pure functions, so they are easy to unit test.
import type { TicketPriority, TicketStatus } from '@prisma/client';

/**
 * Hours allowed to resolve a ticket, by priority. The SAD lists the final numbers as an open
 * issue; these match the seed data. Change them here only.
 */
export const SLA_HOURS: Record<TicketPriority, number> = {
  LOW: 72,
  MEDIUM: 48,
  HIGH: 24,
  URGENT: 4,
};

const HOUR_MS = 3_600_000;

/** Statuses that still count against the SLA clock. */
export const OPEN_STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS'];

export const isOpen = (status: TicketStatus) => OPEN_STATUSES.includes(status);

/** SLA due time = when the ticket was raised + the hours for its priority. */
export const slaDueAt = (createdAt: Date, priority: TicketPriority) =>
  new Date(createdAt.getTime() + SLA_HOURS[priority] * HOUR_MS);

/** A ticket is breached while it is still open after its SLA due time. */
export const isBreached = (
  ticket: { status: TicketStatus; slaDueAt: Date },
  now: Date = new Date(),
) => isOpen(ticket.status) && now.getTime() > ticket.slaDueAt.getTime();
