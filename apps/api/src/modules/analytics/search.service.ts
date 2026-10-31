// apps/api/src/modules/analytics/search.service.ts
import { prisma } from '../../common/prisma';
import type { AuthUser } from '../../modules/auth/auth.service';

/**
 * Perform a global search across multiple entities.
 * Returns up to 5 results per entity.
 * Enforces RBAC & ownership filtering (CRM-5 rules).
 */
export async function globalSearch(query: string, user: AuthUser) {
  const where = { contains: query, mode: 'insensitive' as const };
  // Helper to apply ownership filter based on role
  const ownerFilter = (field: string) =>
    user.role === 'SALES_REP' ? { [field]: user.id } : {};

  const leads = await prisma.lead.findMany({
    where: {
      AND: [
        { OR: [{ name: where }, { email: where }] },
        ownerFilter('ownerId'),
      ],
    },
    select: { id: true, name: true, email: true },
    take: 5,
  });

  const contacts = await prisma.contact.findMany({
    where: {
      AND: [
        { OR: [{ name: where }, { email: where }] },
        // SUPPORT can see all contacts; others see owned only
        user.role === 'SUPPORT' ? {} : ownerFilter('ownerId'),
      ],
    },
    select: { id: true, name: true, email: true },
    take: 5,
  });

  const accounts = await prisma.account.findMany({
    where: {
      AND: [
        { OR: [{ name: where }, { industry: where }, { city: where }] }
      ],
    },
    select: { id: true, name: true },
    take: 5,
  });

  const deals = await prisma.deal.findMany({
    where: {
      AND: [
        { OR: [{ title: where }] },
        ownerFilter('ownerId')
      ],
    },
    select: { id: true, title: true },
    take: 5,
  });

  const tickets = await prisma.ticket.findMany({
    where: {
      AND: [
        { OR: [{ subject: where }, { description: where }] },
        // SUPPORT can see all tickets, others own only
        user.role === 'SUPPORT' ? {} : ownerFilter('ownerId'),
      ],
    },
    select: { id: true, subject: true },
    take: 5,
  });

  return { leads, contacts, accounts, deals, tickets };
}
