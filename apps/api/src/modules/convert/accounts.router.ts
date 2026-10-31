// CRM-11: /api/v1/accounts routes. SUPPORT can only read.
import { Router } from 'express';
import { validate } from '../../common/validate';
import type { NextFunction, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';

// TEMP until CRM-5 is merged: then delete this and import authorize from auth.middleware.
const authorize =
  (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction) =>
    req.user && roles.includes((req.user as { role: string }).role)
      ? next()
      : res.status(403).json({ code: 'FORBIDDEN', message: 'You do not have permission' });
import { accountsController as ctrl } from './accounts.controller';
import { createAccountBody, listAccountsQuery, updateAccountBody } from './accounts.schema';

const canRead = authorize('ADMIN', 'SALES_MANAGER', 'SALES_REP', 'SUPPORT');
const canWrite = authorize('ADMIN', 'SALES_MANAGER', 'SALES_REP');

export const accountsRouter = Router();

accountsRouter.use(authenticate);

accountsRouter.get('/', canRead, validate(listAccountsQuery, 'query'), ctrl.list);
accountsRouter.get('/:id', canRead, ctrl.get);
accountsRouter.post('/', canWrite, validate(createAccountBody), ctrl.create);
accountsRouter.patch('/:id', canWrite, validate(updateAccountBody), ctrl.update);
accountsRouter.delete('/:id', canWrite, ctrl.remove);
