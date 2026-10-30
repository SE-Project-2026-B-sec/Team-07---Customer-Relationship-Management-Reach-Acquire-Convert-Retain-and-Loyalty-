import type { Request, RequestHandler, Response } from 'express';
import { AppError } from '../../common/errors';
import {
  contactSearchQuery,
  type CreateDealInput,
  listDealsQuery,
  type MoveStageInput,
  type UpdateDealInput,
} from './deals.schema';
import { dealsService } from './deals.service';

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

export const dealsController = {
  list: handle(async (req, res) => {
    res.json(await dealsService.list(actor(req), listDealsQuery.parse(req.query)));
  }),

  contacts: handle(async (req, res) => {
    const { search } = contactSearchQuery.parse(req.query);
    res.json(await dealsService.searchContacts(actor(req), search));
  }),

  create: handle(async (req, res) => {
    res.status(201).json(await dealsService.create(actor(req), req.body as CreateDealInput));
  }),

  update: handle(async (req, res) => {
    res.json(await dealsService.update(actor(req), req.params.id, req.body as UpdateDealInput));
  }),

  moveStage: handle(async (req, res) => {
    res.json(await dealsService.moveStage(actor(req), req.params.id, req.body as MoveStageInput));
  }),
};
