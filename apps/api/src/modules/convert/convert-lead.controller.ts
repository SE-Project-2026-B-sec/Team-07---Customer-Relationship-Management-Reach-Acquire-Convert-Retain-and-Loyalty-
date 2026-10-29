// CRM-13: POST /leads/:id/convert controller.
import type { NextFunction, Request, Response } from 'express';
import type { CurrentUser } from './contacts.service';
import { convertLeadService } from './convert-lead.service';

export const convertLeadController = {
  convert(req: Request, res: Response, next: NextFunction) {
    convertLeadService
      .convert(req.user as CurrentUser, req.params.id, req.body)
      .then((result) => res.status(201).json(result))
      .catch(next);
  },
};
