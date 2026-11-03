import { Router } from 'express';
import { ordersRouter, pointsRouter } from './orders.router';

/**
 * Loyalty module — CRM-24 orders and points, CRM-25 tiers, CRM-26 rewards (Disha);
 * CRM-27 referrals (Balla).
 * Endpoints: GET/POST /orders, GET /customers/:id/points, GET/POST/PATCH /rewards,
 *            POST /rewards/:id/redeem, GET /tiers
 * Rule: points change only by inserting PointsLedger rows inside a transaction.
 */
export const loyaltyRouter = Router();

// CRM-24
loyaltyRouter.use('/orders', ordersRouter);
loyaltyRouter.use('/customers', pointsRouter);
