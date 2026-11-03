import { Router } from 'express';
import { auditRouter } from './audit.router';
import { reportsRouter } from './reports.router';
import { searchRouter } from './search.router';
import { dashboardRouter } from './dashboard.router';
/**
 * Analytics module — CRM-15 search, CRM-29 funnel and export, CRM-31 audit log (Diya);
 * CRM-28 dashboard KPIs (Dhriti).
 * Endpoints: GET /search?q=, GET /dashboard/kpis?from&to, GET /reports/funnel,
 *            GET /reports/:name/export.csv, GET /audit-logs
 */
export const analyticsRouter = Router();

// CRM-15 (Diya)
analyticsRouter.use(searchRouter);

// CRM-29 (Diya)
analyticsRouter.use(reportsRouter);

// CRM-28 (Dhriti)
analyticsRouter.use(dashboardRouter);

// CRM-31 (Diya)
analyticsRouter.use(auditRouter);
