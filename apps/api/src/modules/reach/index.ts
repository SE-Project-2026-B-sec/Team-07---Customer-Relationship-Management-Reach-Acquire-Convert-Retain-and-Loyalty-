import { Router } from 'express';
import { campaignsRouter } from './campaigns.router';
import { segmentsRouter } from './segments.router';

/**
 * Reach module — CRM-17 segments, CRM-19 campaign metrics (Balla); CRM-18 campaigns (Dhriti).
 * Endpoints: GET/POST /segments, GET/PATCH /segments/:id, POST /segments/preview,
 *            GET /segments/:id/audience, GET/POST/PATCH /campaigns,
 *            POST /campaigns/:id/send, GET /campaigns/:id/metrics
 */
export const reachRouter = Router();

// CRM-18 (Dhriti)
reachRouter.use(campaignsRouter);
// CRM-17 (Balla)
reachRouter.use(segmentsRouter);

/** CRM-19: the contact ids a campaign is sent to. Always excludes contacts without consent. */
export { resolveAudience } from './segments.service';
