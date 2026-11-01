import { Router } from 'express';
import { validate } from '../../common/validate';
import { authenticate } from '../auth';
import { dealsController as c } from './deals.controller';
import { createDealSchema, dealIdParams, moveStageSchema, updateDealSchema } from './deals.schema';

export const dealsRouter = Router();

dealsRouter.get('/deals', authenticate, c.list);
dealsRouter.get('/deals/contacts', authenticate, c.contacts);
dealsRouter.post('/deals', authenticate, validate(createDealSchema), c.create);
dealsRouter.patch(
  '/deals/:id',
  authenticate,
  validate(dealIdParams, 'params'),
  validate(updateDealSchema),
  c.update,
);
dealsRouter.patch(
  '/deals/:id/stage',
  authenticate,
  validate(dealIdParams, 'params'),
  validate(moveStageSchema),
  c.moveStage,
);
