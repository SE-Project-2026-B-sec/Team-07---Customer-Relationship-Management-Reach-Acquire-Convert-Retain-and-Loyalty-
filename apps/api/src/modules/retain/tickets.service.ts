// CRM-21: support tickets with SLA (CRM-F-040).
// Business rules:
//   - SLA due time is set from priority when the ticket is created (see tickets.sla.ts).
//   - Changing priority recalculates the due time from when the ticket was raised.
//   - Resolved/Closed stamps resolvedAt; reopening clears it.
//   - "breached" = still open after the SLA due time; the UI shows these in red.
import type { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors';
import { paged, toSkipTake } from '../../common/pagination';
import type { AuthUser } from '../auth';
import { type TicketRow, ticketsRepository as repo } from './tickets.repository';
import type { CreateTicketInput, ListTicketsQuery, UpdateTicketInput } from './tickets.schema';
import { isBreached, isOpen, OPEN_STATUSES, slaDueAt } from './tickets.sla';

const toDto = (t: TicketRow, now = new Date()) => ({
  id: t.id,
  subject: t.subject,
  description: t.description,
  priority: t.priority,
  status: t.status,
  slaDueAt: t.slaDueAt,
  resolvedAt: t.resolvedAt,
  breached: isBreached(t, now),
  contactId: t.contactId,
  contactName: t.contact.name,
  assigneeId: t.assigneeId,
  assigneeName: t.assignee?.name ?? null,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});

const notFound = () => new AppError(404, 'TICKET_NOT_FOUND', 'Ticket not found');

async function assertAssignable(assigneeId: string | null | undefined) {
  if (assigneeId && !(await repo.isAssignable(assigneeId))) {
    throw new AppError(400, 'INVALID_ASSIGNEE', 'Tickets can only be assigned to Support or Admin');
  }
}

export const ticketsService = {
  async list(query: ListTicketsQuery) {
    const now = new Date();
    const where: Prisma.TicketWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.priority && { priority: query.priority }),
      ...(query.contactId && { contactId: query.contactId }),
      ...(query.q && {
        OR: [
          { subject: { contains: query.q, mode: 'insensitive' } },
          { contact: { name: { contains: query.q, mode: 'insensitive' } } },
        ],
      }),
    };
    if (query.breached === true) {
      where.AND = [{ status: { in: OPEN_STATUSES } }, { slaDueAt: { lt: now } }];
    } else if (query.breached === false) {
      where.NOT = { status: { in: OPEN_STATUSES }, slaDueAt: { lt: now } };
    }
    const { rows, total } = await repo.list(where, toSkipTake(query));
    return paged(
      rows.map((r) => toDto(r, now)),
      total,
      query,
    );
  },

  async get(id: string) {
    const row = await repo.findById(id);
    if (!row) throw notFound();
    return toDto(row);
  },

  assignees: () => repo.assignees(),

  async create(user: AuthUser, input: CreateTicketInput) {
    if (!(await repo.contactExists(input.contactId))) {
      throw new AppError(404, 'CONTACT_NOT_FOUND', 'Contact not found');
    }
    // A Support agent who raises a ticket owns it unless they pick someone else.
    const assigneeId =
      input.assigneeId !== undefined ? input.assigneeId : user.role === 'SUPPORT' ? user.id : null;
    await assertAssignable(assigneeId);

    const createdAt = new Date();
    const row = await repo.create({
      subject: input.subject,
      description: input.description,
      priority: input.priority,
      contactId: input.contactId,
      assigneeId,
      createdAt,
      slaDueAt: slaDueAt(createdAt, input.priority),
    });
    return toDto(row);
  },

  async update(id: string, input: UpdateTicketInput) {
    const existing = await repo.findById(id);
    if (!existing) throw notFound();
    await assertAssignable(input.assigneeId);

    const data: Prisma.TicketUncheckedUpdateInput = {
      subject: input.subject,
      description: input.description,
      priority: input.priority,
      status: input.status,
      assigneeId: input.assigneeId,
    };
    if (input.priority && input.priority !== existing.priority) {
      data.slaDueAt = slaDueAt(existing.createdAt, input.priority);
    }
    if (input.status && input.status !== existing.status) {
      if (!isOpen(input.status) && !existing.resolvedAt) data.resolvedAt = new Date();
      if (isOpen(input.status)) data.resolvedAt = null;
    }
    return toDto(await repo.update(id, data));
  },
};
