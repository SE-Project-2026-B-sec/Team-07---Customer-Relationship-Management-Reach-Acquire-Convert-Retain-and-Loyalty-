import { Router } from 'express';

/**
 * Reach module — CRM-17 segments, CRM-19 campaign metrics (Balla); CRM-18 campaigns (Dhriti).
 * Endpoints: GET/POST/PATCH /segments, GET/POST/PATCH /campaigns,
 *            POST /campaigns/:id/send, GET /campaigns/:id/metrics
 */
export const reachRouter = Router();
