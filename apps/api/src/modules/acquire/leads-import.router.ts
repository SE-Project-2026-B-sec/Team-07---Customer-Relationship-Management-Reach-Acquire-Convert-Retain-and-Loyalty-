import { Router } from 'express';
import { validate } from '../../common/validate';
import { authenticate, authorize } from '../auth/auth.middleware';
import { leadsImportController as ctrl } from './leads-import.controller';
import { importLeadsBody } from './leads-import.schema';

export const leadsImportRouter = Router();

// Admin, Marketing and Sales Manager only. Login and role are checked before the body.
leadsImportRouter.post(
  '/leads/import',
  authenticate,
  authorize('ADMIN', 'MARKETING', 'SALES_MANAGER'),
  validate(importLeadsBody),
  ctrl.importCsv,
);
