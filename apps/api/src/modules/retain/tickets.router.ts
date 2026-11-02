// CRM-21: /tickets routes. Admin and Support manage tickets; Sales Manager can read them
// (roles table in modules/auth/roles.ts).
import { Router } from 'express';
import { validate } from '../../common/validate';
import { authenticate, authorize } from '../auth';
import { ticketsController as c } from './tickets.controller';
import {
  createTicketSchema,
  listTicketsQuery,
  ticketIdParams,
  updateTicketSchema,
} from './tickets.schema';

export const ticketsRouter = Router();

const canRead = authorize('ADMIN', 'SUPPORT', 'SALES_MANAGER');
const canWrite = authorize('ADMIN', 'SUPPORT');

ticketsRouter.get('/tickets', authenticate, canRead, validate(listTicketsQuery, 'query'), c.list);
// Registered before /tickets/:id so "assignees" is not read as an id.
ticketsRouter.get('/tickets/assignees', authenticate, canWrite, c.assignees);
ticketsRouter.get('/tickets/:id', authenticate, canRead, validate(ticketIdParams, 'params'), c.get);
ticketsRouter.post('/tickets', authenticate, canWrite, validate(createTicketSchema), c.create);
ticketsRouter.patch(
  '/tickets/:id',
  authenticate,
  canWrite,
  validate(ticketIdParams, 'params'),
  validate(updateTicketSchema),
  c.update,
);
