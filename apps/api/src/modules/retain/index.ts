import { Router } from 'express';

/**
 * Retain module — CRM-21 tickets with SLA, CRM-23 churn flag (Diya); CRM-22 Customer 360 (Dhriti).
 * Endpoints: GET/POST/PATCH /tickets, GET /customers/:id/360
 */
export const retainRouter = Router();
