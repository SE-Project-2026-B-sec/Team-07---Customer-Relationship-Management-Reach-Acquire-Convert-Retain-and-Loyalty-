// CRM-25: GET /api/v1/tiers (anyone logged in), PATCH /api/v1/tiers/:name (ADMIN only).
import { Router } from 'express';
import { validate } from '../../common/validate';
import { ADMIN_ONLY, authenticate, authorize } from '../auth';
import { tiersController as ctrl } from './tiers.controller';
import { updateTierBody } from './tiers.schema';

export const tiersRouter = Router();
tiersRouter.get('/', authenticate, ctrl.list);
tiersRouter.patch(
  '/:name',
  authenticate,
  authorize(...ADMIN_ONLY),
  validate(updateTierBody),
  ctrl.update,
);
