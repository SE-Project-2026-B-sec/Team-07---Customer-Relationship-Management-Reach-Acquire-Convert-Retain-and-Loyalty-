// CRM-10: lead assignment controller.
import type { NextFunction, Request, Response } from 'express';
import { leadAssignmentService } from './lead-assignment.service';

export const leadAssignmentController = {
  assignOne(req: Request, res: Response, next: NextFunction) {
    leadAssignmentService
      .assignOne(req.params.id, req.body)
      .then((lead) => res.json(lead))
      .catch(next);
  },

  roundRobin(req: Request, res: Response, next: NextFunction) {
    leadAssignmentService
      .assignRoundRobin(req.body)
      .then((result) => res.json(result))
      .catch(next);
  },
};
