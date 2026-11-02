// CRM-21: request validation for /tickets.
import { TicketPriority, TicketStatus } from '@prisma/client';
import { z } from 'zod';
import { paginationQuery } from '../../common/pagination';

export const ticketIdParams = z.object({ id: z.string().uuid() });

export const listTicketsQuery = paginationQuery.extend({
  status: z.nativeEnum(TicketStatus).optional(),
  priority: z.nativeEnum(TicketPriority).optional(),
  // ?breached=true shows only open tickets that are past their SLA due time.
  breached: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  contactId: z.string().uuid().optional(),
  q: z.string().trim().min(1).max(100).optional(),
});

const subject = z.string().trim().min(1, 'Subject is required').max(200);
const description = z.string().trim().min(1, 'Description is required').max(5000);

export const createTicketSchema = z.object({
  subject,
  description,
  priority: z.nativeEnum(TicketPriority).default('MEDIUM'),
  contactId: z.string().uuid('Choose a contact'),
  assigneeId: z.string().uuid().nullish(),
});

export const updateTicketSchema = z
  .object({
    subject: subject.optional(),
    description: description.optional(),
    priority: z.nativeEnum(TicketPriority).optional(),
    status: z.nativeEnum(TicketStatus).optional(),
    assigneeId: z.string().uuid().nullable().optional(),
  })
  .refine((t) => Object.values(t).some((v) => v !== undefined), {
    message: 'Provide at least one field to change',
  });

export type ListTicketsQuery = z.infer<typeof listTicketsQuery>;
export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
