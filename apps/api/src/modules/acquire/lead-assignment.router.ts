// CRM-10: PATCH /api/v1/leads/:id/assign and POST /api/v1/leads/assign/round-robin.
// Only ADMIN and SALES_MANAGER; a SALES_REP gets 403 (TC-ACQ-06).
// Auth is applied per route so Balla's other /leads routes are untouched.
import { Router } from 'express';
import { validate } from '../../common/validate';
import { authenticate, authorize } from '../auth/auth.middleware';
import { leadAssignmentController as ctrl } from './lead-assignment.controller';
import { assignLeadBody, roundRobinBody } from './lead-assignment.schema';

const managersOnly = [authenticate, authorize('ADMIN', 'SALES_MANAGER')];

export const leadAssignmentRouter = Router();

leadAssignmentRouter.post(
  '/assign/round-robin',
  ...managersOnly,
  validate(roundRobinBody),
  ctrl.roundRobin,
);
leadAssignmentRouter.patch(
  '/:id/assign',
  ...managersOnly,
  validate(assignLeadBody),
  ctrl.assignOne,
);
