// CRM-21: reads the request, calls the service, sends the response.
import type { Request, RequestHandler, Response } from 'express';
import {
  type CreateTicketInput,
  type ListTicketsQuery,
  type UpdateTicketInput,
} from './tickets.schema';
import { ticketsService } from './tickets.service';

// Express 4 does not catch errors from async handlers, so pass them to next().
const handle =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

export const ticketsController = {
  list: handle(async (req, res) => {
    res.json(await ticketsService.list(req.query as unknown as ListTicketsQuery));
  }),

  get: handle(async (req, res) => {
    res.json(await ticketsService.get(req.params.id));
  }),

  assignees: handle(async (_req, res) => {
    res.json(await ticketsService.assignees());
  }),

  create: handle(async (req, res) => {
    res.status(201).json(await ticketsService.create(req.user!, req.body as CreateTicketInput));
  }),

  update: handle(async (req, res) => {
    res.json(await ticketsService.update(req.params.id, req.body as UpdateTicketInput));
  }),
};
