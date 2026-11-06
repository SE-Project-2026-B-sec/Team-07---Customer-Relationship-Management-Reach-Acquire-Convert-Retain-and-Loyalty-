// CRM-26: /api/v1/rewards
//   GET    /rewards               anyone logged in (admins also see inactive rewards)
//   POST   /rewards               ADMIN
//   PATCH  /rewards/:id           ADMIN
//   POST   /rewards/:id/redeem    ADMIN, SUPPORT
// plus GET /customers/:id/redemptions (ADMIN, SUPPORT, SALES_MANAGER)
import { Router } from 'express';
import { validate } from '../../common/validate';
import { ADMIN_ONLY, authenticate, authorize, SUPPORT_TEAM } from '../auth';
import { rewardsController as ctrl } from './rewards.controller';
import { createRewardBody, redeemBody, updateRewardBody } from './rewards.schema';

export const rewardsRouter = Router();
rewardsRouter.get('/', authenticate, ctrl.list);
rewardsRouter.post(
  '/',
  authenticate,
  authorize(...ADMIN_ONLY),
  validate(createRewardBody),
  ctrl.create,
);
rewardsRouter.patch(
  '/:id',
  authenticate,
  authorize(...ADMIN_ONLY),
  validate(updateRewardBody),
  ctrl.update,
);
rewardsRouter.post(
  '/:id/redeem',
  authenticate,
  authorize(...SUPPORT_TEAM),
  validate(redeemBody),
  ctrl.redeem,
);

// Mounted at /customers, next to the CRM-24 points route.
export const redemptionsRouter = Router();
redemptionsRouter.get(
  '/:id/redemptions',
  authenticate,
  authorize(...SUPPORT_TEAM, 'SALES_MANAGER'),
  ctrl.history,
);
