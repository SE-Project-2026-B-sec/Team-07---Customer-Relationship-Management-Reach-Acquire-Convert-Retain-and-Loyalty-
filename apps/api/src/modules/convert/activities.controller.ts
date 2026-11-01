import type { Request, RequestHandler, Response } from 'express';
import { AppError } from '../../common/errors';
import {
  type CreateActivityInput,
  listActivitiesQuery,
  type UpdateActivityInput,
} from './activities.schema';
import { activitiesService } from './activities.service';

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

export const activitiesController = {
  list: handle(async (req, res) => {
    res.json(await activitiesService.list(actor(req), listActivitiesQuery.parse(req.query)));
  }),

  create: handle(async (req, res) => {
    res
      .status(201)
      .json(await activitiesService.create(actor(req), req.body as CreateActivityInput));
  }),

  update: handle(async (req, res) => {
    res.json(
      await activitiesService.update(actor(req), req.params.id, req.body as UpdateActivityInput),
    );
  }),
};
