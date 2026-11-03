// CRM-25: tiers controller.
import type { NextFunction, Request, Response } from 'express';
import { tiersService } from './tiers.service';

export const tiersController = {
  list(_req: Request, res: Response, next: NextFunction) {
    tiersService
      .list()
      .then((tiers) => res.json(tiers))
      .catch(next);
  },
  update(req: Request, res: Response, next: NextFunction) {
    tiersService
      .update(req.params.name, req.body)
      .then((tier) => res.json(tier))
      .catch(next);
  },
};
