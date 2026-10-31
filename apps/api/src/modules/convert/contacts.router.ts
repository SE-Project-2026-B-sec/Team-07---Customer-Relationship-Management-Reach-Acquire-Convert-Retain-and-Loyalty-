// CRM-11: /api/v1/contacts routes.
// ADMIN, SALES_MANAGER and SALES_REP can do everything; SUPPORT can only read.
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
import { contactsController as ctrl } from './contacts.controller';
import { createContactBody, listContactsQuery, updateContactBody } from './contacts.schema';

const canRead = authorize('ADMIN', 'SALES_MANAGER', 'SALES_REP', 'SUPPORT');
const canWrite = authorize('ADMIN', 'SALES_MANAGER', 'SALES_REP');

export const contactsRouter = Router();

contactsRouter.use(authenticate);

contactsRouter.get('/', canRead, validate(listContactsQuery, 'query'), ctrl.list);
contactsRouter.get('/:id', canRead, ctrl.get);
contactsRouter.post('/', canWrite, validate(createContactBody), ctrl.create);
contactsRouter.patch('/:id', canWrite, validate(updateContactBody), ctrl.update);
contactsRouter.delete('/:id', canWrite, ctrl.remove);
