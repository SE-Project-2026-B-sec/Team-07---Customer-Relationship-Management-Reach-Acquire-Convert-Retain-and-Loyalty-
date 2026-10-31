import type { Request, RequestHandler, Response } from 'express';
import { AppError } from '../../common/errors';
import {
  type CreateLeadInput,
  listLeadsQuery,
  type PublicLeadInput,
  type UpdateLeadInput,
} from './leads.schema';
import { leadsService } from './leads.service';

function actor(req: Request) {
  if (!req.user) throw new AppError(401, 'UNAUTHENTICATED', 'Please log in');
  return req.user;
}

// Sends any thrown error to the shared error handler.
const handle =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

export const leadsController = {
  capturePublic: handle(async (req, res) => {
    res.status(201).json(await leadsService.capturePublic(req.body as PublicLeadInput));
  }),

  list: handle(async (req, res) => {
    res.json(await leadsService.list(actor(req), listLeadsQuery.parse(req.query)));
  }),

  get: handle(async (req, res) => {
    res.json(await leadsService.get(actor(req), req.params.id));
  }),

  create: handle(async (req, res) => {
    res.status(201).json(await leadsService.create(actor(req), req.body as CreateLeadInput));
  }),

  update: handle(async (req, res) => {
    res.json(await leadsService.update(actor(req), req.params.id, req.body as UpdateLeadInput));
  }),
};
