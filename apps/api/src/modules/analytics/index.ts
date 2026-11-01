import { Router } from 'express';
import { searchRouter } from './search.router';

/**
 * Analytics module — CRM-15 search, CRM-29 funnel and export, CRM-31 audit log (Diya);
 * CRM-28 dashboard KPIs (Dhriti).
 * Endpoints: GET /search?q=, GET /dashboard/kpis?from&to, GET /reports/funnel,
 *            GET /reports/:name/export.csv, GET /audit-logs
 */
export const analyticsRouter = Router();

// CRM-15 (Diya)
analyticsRouter.use(searchRouter);
