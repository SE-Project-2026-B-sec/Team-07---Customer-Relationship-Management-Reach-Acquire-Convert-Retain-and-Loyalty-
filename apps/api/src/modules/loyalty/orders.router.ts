// CRM-24: /api/v1/orders and /api/v1/customers/:id/points.
// Loyalty is run by ADMIN and SUPPORT; SALES_MANAGER can read (SRS 2.3, auth/roles.ts).
import { Router } from 'express';
import { validate } from '../../common/validate';
import { authenticate, authorize, SUPPORT_TEAM } from '../auth';
import { ordersController as ctrl } from './orders.controller';
import { createOrderBody, listOrdersQuery } from './orders.schema';

const canRead = authorize(...SUPPORT_TEAM, 'SALES_MANAGER');
const canWrite = authorize(...SUPPORT_TEAM);

export const ordersRouter = Router();
ordersRouter.get('/', authenticate, canRead, validate(listOrdersQuery, 'query'), ctrl.list);
ordersRouter.get('/:id', authenticate, canRead, ctrl.get);
ordersRouter.post('/', authenticate, canWrite, validate(createOrderBody), ctrl.create);

// Mounted at /customers. Only this one route, so other /customers routes are untouched.
export const pointsRouter = Router();
pointsRouter.get('/:id/points', authenticate, canRead, ctrl.points);
