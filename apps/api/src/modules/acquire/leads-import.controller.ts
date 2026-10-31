import type { NextFunction, Request, Response } from 'express';
import type { ImportLeadsBody } from './leads-import.schema';
import { importLeads } from './leads-import.service';

export const leadsImportController = {
  importCsv(req: Request, res: Response, next: NextFunction) {
    importLeads((req.body as ImportLeadsBody).rows)
      .then((report) => res.json(report))
      .catch(next);
  },
};
