import type { Request, RequestHandler, Response } from 'express';
import { kpiQuery } from './dashboard.schema';
import { dashboardService } from './dashboard.service';

const handle =
    (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
        (req, res, next) => {
            fn(req, res).catch(next);
        };

export const dashboardController = {
    kpis: handle(async (req, res) => {
        res.json(await dashboardService.kpis(kpiQuery.parse(req.query)));
    }),
};