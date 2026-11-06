import { Router } from 'express';
import { ordersRouter, pointsRouter } from './orders.router';
import { redemptionsRouter, rewardsRouter } from './rewards.router';
import { referralsRouter } from './referrals.router';
import { tiersRouter } from './tiers.router';

/**
 * Loyalty module — CRM-24 orders and points, CRM-25 tiers, CRM-26 rewards (Disha);
 * CRM-27 referrals (Balla).
 * Endpoints: GET/POST /orders, GET /customers/:id/points, GET/POST/PATCH /rewards,
 *            POST /rewards/:id/redeem, GET /tiers, GET /customers/:id/referrals
 * Rule: points change only by inserting PointsLedger rows inside a transaction.
 */
export const loyaltyRouter = Router();

// CRM-24
loyaltyRouter.use('/orders', ordersRouter);
loyaltyRouter.use('/customers', pointsRouter);

// CRM-25
loyaltyRouter.use('/tiers', tiersRouter);

// CRM-26
loyaltyRouter.use('/rewards', rewardsRouter);
loyaltyRouter.use('/customers', redemptionsRouter);

// CRM-27 (Balla). The bonus itself is awarded when a contact is created with a referral code
// (POST /contacts or POST /leads/:id/convert), through recordReferral().
loyaltyRouter.use('/customers', referralsRouter);

export { recordReferral } from './referrals.service';
