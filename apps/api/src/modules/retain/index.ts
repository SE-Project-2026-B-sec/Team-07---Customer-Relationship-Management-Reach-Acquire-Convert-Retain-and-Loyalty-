import { Router } from 'express';
import { churnRouter } from './churn.router';
import { customer360Router } from './customer360.router';
import { ticketsRouter } from './tickets.router';

/**
 * Retain module — CRM-21 tickets with SLA, CRM-23 churn flag (Diya); CRM-22 Customer 360 (Dhriti).
 * Endpoints: GET/POST/PATCH /tickets, GET /churn-risk, GET /customers/:id/360
 */
export const retainRouter = Router();
// CRM-22 (Dhriti)
retainRouter.use(customer360Router);

// CRM-21 (Diya)
retainRouter.use(ticketsRouter);

// CRM-23 (Diya)
retainRouter.use(churnRouter);
