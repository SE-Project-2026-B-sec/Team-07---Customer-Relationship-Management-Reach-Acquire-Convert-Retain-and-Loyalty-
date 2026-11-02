// CRM-23: keeps Contact.isChurnRisk up to date and lists at-risk customers.
// recompute() runs the rule from churn.rules.ts in one SQL statement, so it stays fast with
// 10,000 contacts (CRM-NF-008). It is called for one contact when its tickets change, and for
// everyone on API start-up and once a day (the 90-day clock moves even when nothing changes).
import { Prisma } from '@prisma/client';
import { paged, toSkipTake, type Pagination } from '../../common/pagination';
import { prisma } from '../../common/prisma';
import { churnCutoff, evaluateChurn, HIGH_PRIORITIES, MIN_OPEN_HIGH_TICKETS } from './churn.rules';
import { OPEN_STATUSES } from './tickets.sla';

export const churnService = {
  /**
   * Recomputes the flag for one contact, or for all contacts when no id is given.
   * Only rows whose flag actually changes are written. Returns how many changed.
   */
  recompute(contactId?: string, now: Date = new Date()): Promise<number> {
    const cutoff = churnCutoff(now);
    const onlyOne = contactId ? Prisma.sql`WHERE c2.id = ${contactId}` : Prisma.empty;
    // Parameterised query (CRM-SR-005).
    return prisma.$executeRaw`
      UPDATE "Contact" c
      SET "isChurnRisk" = r.at_risk
      FROM (
        SELECT c2.id,
          (
            (EXISTS (SELECT 1 FROM "Order" o WHERE o."contactId" = c2.id)
              AND NOT EXISTS (
                SELECT 1 FROM "Order" o WHERE o."contactId" = c2.id AND o."orderedAt" >= ${cutoff}
              ))
            OR (
              SELECT COUNT(*) FROM "Ticket" t
              WHERE t."contactId" = c2.id
                AND t.status::text IN (${Prisma.join(OPEN_STATUSES)})
                AND t.priority::text IN (${Prisma.join(HIGH_PRIORITIES)})
            ) >= ${MIN_OPEN_HIGH_TICKETS}
          ) AS at_risk
        FROM "Contact" c2
        ${onlyOne}
      ) r
      WHERE c.id = r.id AND c."isChurnRisk" IS DISTINCT FROM r.at_risk
    `;
  },

  /** At-risk customers with the reason(s) for each, sorted by name. */
  async list(query: Pagination & { q?: string }, now: Date = new Date()) {
    const where: Prisma.ContactWhereInput = {
      isChurnRisk: true,
      ...(query.q && {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { email: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.contact.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          tier: true,
          orders: { select: { orderedAt: true }, orderBy: { orderedAt: 'desc' }, take: 1 },
          _count: {
            select: {
              tickets: {
                where: { status: { in: OPEN_STATUSES }, priority: { in: HIGH_PRIORITIES } },
              },
            },
          },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        ...toSkipTake(query),
      }),
      prisma.contact.count({ where }),
    ]);

    const data = rows.map((c) => {
      const lastOrderAt = c.orders[0]?.orderedAt ?? null;
      const openHighTickets = c._count.tickets;
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        tier: c.tier,
        lastOrderAt,
        openHighTickets,
        reasons: evaluateChurn({ lastOrderAt, openHighTickets }, now).reasons,
      };
    });
    return paged(data, total, query);
  },
};
