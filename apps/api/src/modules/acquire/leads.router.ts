import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../common/validate';
import { authenticate, authorize, LEAD_VIEWERS } from '../auth';
import { leadsController as c } from './leads.controller';
import { createLeadSchema, leadIdParams, publicLeadSchema, updateLeadSchema } from './leads.schema';

// CRM-SR-006: at most 100 form submissions per minute from one IP.
const publicFormLimiter = rateLimit({
  windowMs: 60_000,
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many submissions. Try again in a minute' },
  },
});

export const leadsRouter = Router();

// Public: the website enquiry form (no login). Listed in PUBLIC_ROUTES in route-guard.test.ts.
leadsRouter.post('/public/leads', publicFormLimiter, validate(publicLeadSchema), c.capturePublic);

leadsRouter.get('/leads', authenticate, authorize(...LEAD_VIEWERS), c.list);
leadsRouter.post(
  '/leads',
  authenticate,
  authorize(...LEAD_VIEWERS),
  validate(createLeadSchema),
  c.create,
);
leadsRouter.get(
  '/leads/:id',
  authenticate,
  authorize(...LEAD_VIEWERS),
  validate(leadIdParams, 'params'),
  c.get,
);
leadsRouter.patch(
  '/leads/:id',
  authenticate,
  authorize(...LEAD_VIEWERS),
  validate(leadIdParams, 'params'),
  validate(updateLeadSchema),
  c.update,
);
