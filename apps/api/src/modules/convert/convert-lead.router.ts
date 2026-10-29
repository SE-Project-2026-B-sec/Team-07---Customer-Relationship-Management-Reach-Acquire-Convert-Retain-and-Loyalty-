// CRM-13: POST /api/v1/leads/:id/convert
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { validate } from '../../common/validate';
import { authenticate } from '../auth/auth.middleware';
import { convertLeadController as ctrl } from './convert-lead.controller';
import { convertLeadBody } from './convert-lead.schema';

// TEMP until CRM-5 is merged: then delete this and import authorize from auth.middleware.
const authorize =
  (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction) =>
    req.user && roles.includes((req.user as { role: string }).role)
      ? next()
      : res.status(403).json({ code: 'FORBIDDEN', message: 'You do not have permission' });

export const convertLeadRouter = Router();

convertLeadRouter.post(
  '/:id/convert',
  authenticate,
  authorize('ADMIN', 'SALES_MANAGER', 'SALES_REP'),
  validate(convertLeadBody),
  ctrl.convert,
);
