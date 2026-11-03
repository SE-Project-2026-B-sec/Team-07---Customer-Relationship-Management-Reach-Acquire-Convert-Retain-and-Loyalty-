// CRM-21: Prisma queries for tickets.
import type { Prisma } from '@prisma/client';
import { prisma } from '../../common/prisma';

const include = {
  contact: { select: { id: true, name: true, isChurnRisk: true } },
  assignee: { select: { id: true, name: true } },
} satisfies Prisma.TicketInclude;

export type TicketRow = Prisma.TicketGetPayload<{ include: typeof include }>;

export const ticketsRepository = {
  async list(where: Prisma.TicketWhereInput, page: { skip: number; take: number }) {
    const [rows, total] = await prisma.$transaction([
      prisma.ticket.findMany({
        where,
        include,
        // Unresolved tickets first, most urgent due time first.
        orderBy: [
          { resolvedAt: { sort: 'asc', nulls: 'first' } },
          { slaDueAt: 'asc' },
          { id: 'asc' },
        ],
        ...page,
      }),
      prisma.ticket.count({ where }),
    ]);
    return { rows, total };
  },

  findById: (id: string) => prisma.ticket.findUnique({ where: { id }, include }),

  contactExists: async (id: string) => (await prisma.contact.count({ where: { id } })) > 0,

  /** Active Support agents and Admins: the people a ticket can be assigned to. */
  assignees: () =>
    prisma.user.findMany({
      where: { isActive: true, role: { in: ['SUPPORT', 'ADMIN'] } },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    }),

  isAssignable: async (id: string) =>
    (await prisma.user.count({
      where: { id, isActive: true, role: { in: ['SUPPORT', 'ADMIN'] } },
    })) > 0,

  create: (data: Prisma.TicketUncheckedCreateInput) => prisma.ticket.create({ data, include }),

  update: (id: string, data: Prisma.TicketUncheckedUpdateInput) =>
    prisma.ticket.update({ where: { id }, data, include }),
};
