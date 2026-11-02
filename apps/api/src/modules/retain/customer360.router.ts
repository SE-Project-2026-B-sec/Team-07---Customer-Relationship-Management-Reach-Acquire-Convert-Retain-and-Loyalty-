import { Router } from 'express';
import { validate } from '../../common/validate';
import { authenticate, authorize } from '../auth/auth.middleware';
import { customer360Controller as c } from './customer360.controller';
import { customerIdParams } from './customer360.schema';

export const customer360Router = Router();

// Admin, Support and Sales Manager, as in the roles table in auth/roles.ts.
customer360Router.get(
  '/customers/:id/360',
  authenticate,
  authorize('ADMIN', 'SUPPORT', 'SALES_MANAGER'),
  validate(customerIdParams, 'params'),
  c.get,
);
