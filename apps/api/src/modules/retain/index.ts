import { Router } from 'express';
import { customer360Router } from './customer360.router';

/**
 * Retain module — CRM-21 tickets with SLA, CRM-23 churn flag (Diya); CRM-22 Customer 360 (Dhriti).
 * Endpoints: GET/POST/PATCH /tickets, GET /customers/:id/360
 */
export const retainRouter = Router();
// CRM-22 (Dhriti)
retainRouter.use(customer360Router);
