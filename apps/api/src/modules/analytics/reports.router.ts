// CRM-29: GET /reports/funnel and GET /reports/:name/export.csv
import { Router, type NextFunction, type Request, type Response } from 'express';
import { validate } from '../../common/validate';
import { authenticate, authorize, REPORT_VIEWERS } from '../auth';
import { exportService } from './export.service';
import { funnelService } from './funnel.service';
import { exportParams, type ExportName, funnelQuery, type FunnelQuery } from './reports.schema';

export const reportsRouter = Router();

reportsRouter.get(
  '/reports/funnel',
  authenticate,
  authorize(...REPORT_VIEWERS),
  validate(funnelQuery, 'query'),
  (req: Request, res: Response, next: NextFunction) => {
    funnelService
      .funnel(req.query as unknown as FunnelQuery)
      .then((report) => res.json(report))
      .catch(next);
  },
);

// Any logged-in user; the export itself checks the role for that list (same as the screen).
reportsRouter.get(
  '/reports/:name/export.csv',
  authenticate,
  validate(exportParams, 'params'),
  (req: Request, res: Response, next: NextFunction) => {
    const name = req.params.name as ExportName;
    exportService
      .toCsv(name, req.user!, req.query as Record<string, unknown>)
      .then(({ csv, rows }) => {
        const date = new Date().toISOString().slice(0, 10);
        res
          .status(200)
          .type('text/csv; charset=utf-8')
          .set('Content-Disposition', `attachment; filename="${name}-${date}.csv"`)
          .set('X-Total-Count', String(rows))
          .set('Access-Control-Expose-Headers', 'Content-Disposition, X-Total-Count')
          .send(csv);
      })
      .catch(next);
  },
);
