import { Router } from 'express';
import { leadsRouter } from './leads.router';
import { leadAssignmentRouter } from './lead-assignment.router';

/**
 * Acquire module — CRM-8 lead capture, CRM-20 scoring (Balla); CRM-9 CSV import (Dhriti);
 * CRM-10 assignment (Disha).
 * Endpoints: POST /public/leads (public, rate limited), GET/POST /leads, GET/PATCH /leads/:id,
 *            POST /leads/import (CRM-9), POST /leads/assign (CRM-10)
 *
 * CRM-9 and CRM-10: create leads only through createLead() from ./leads.service, so the
 * duplicate-email check and campaign link work the same everywhere.
 */
export const acquireRouter = Router();
acquireRouter.use(leadsRouter);

export { createLead } from './leads.service';
acquireRouter.use('/leads', leadAssignmentRouter); // CRM-10
