import type { RequestHandler } from 'express';
import { referralsService } from './referrals.service';

export const referralsController = {
  forCustomer: (async (req, res, next) => {
    try {
      res.json(await referralsService.forCustomer(String(req.params.id)));
    } catch (err) {
      next(err);
    }
  }) as RequestHandler,
};
