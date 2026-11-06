// CRM-27: GET /api/v1/customers/:id/referrals.
// Same readers as points (CRM-24): Admin, Support and Sales Manager.
import { Router } from 'express';
import { authenticate, authorize, SUPPORT_TEAM } from '../auth';
import { referralsController as ctrl } from './referrals.controller';

export const referralsRouter = Router();
referralsRouter.get(
  '/:id/referrals',
  authenticate,
  authorize(...SUPPORT_TEAM, 'SALES_MANAGER'),
  ctrl.forCustomer,
);
