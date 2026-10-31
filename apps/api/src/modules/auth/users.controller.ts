// CRM-6: user admin controller.
import type { NextFunction, Request, Response } from 'express';
import { usersService } from './users.service';

export const usersController = {
  list(_req: Request, res: Response, next: NextFunction) {
    usersService
      .list()
      .then((users) => res.json(users))
      .catch(next);
  },

  create(req: Request, res: Response, next: NextFunction) {
    usersService
      .create(req.body)
      .then((user) => res.status(201).json(user))
      .catch(next);
  },

  update(req: Request, res: Response, next: NextFunction) {
    usersService
      .update(req.user as { id: string; role: string }, req.params.id, req.body)
      .then((user) => res.json(user))
      .catch(next);
  },
};
