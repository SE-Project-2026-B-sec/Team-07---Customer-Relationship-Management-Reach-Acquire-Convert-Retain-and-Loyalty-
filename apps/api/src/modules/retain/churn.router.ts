// CRM-23: GET /churn-risk (at-risk customers with reasons) and POST /churn-risk/recompute (Admin).
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { paginationQuery } from '../../common/pagination';
import { validate } from '../../common/validate';
import { authenticate, authorize } from '../auth';
import { churnService } from './churn.service';

export const churnRouter = Router();

const listQuery = paginationQuery.extend({ q: z.string().trim().min(1).max(100).optional() });

// Support works the tickets, Marketing runs win-back campaigns, managers watch the numbers.
churnRouter.get(
  '/churn-risk',
  authenticate,
  authorize('ADMIN', 'SUPPORT', 'SALES_MANAGER', 'MARKETING'),
  validate(listQuery, 'query'),
  (req: Request, res: Response, next: NextFunction) => {
    churnService
      .list(req.query as unknown as z.infer<typeof listQuery>)
      .then((result) => res.json(result))
      .catch(next);
  },
);

churnRouter.post(
  '/churn-risk/recompute',
  authenticate,
  authorize('ADMIN'),
  (_req: Request, res: Response, next: NextFunction) => {
    churnService
      .recompute()
      .then((changed) => res.json({ changed }))
      .catch(next);
  },
);
