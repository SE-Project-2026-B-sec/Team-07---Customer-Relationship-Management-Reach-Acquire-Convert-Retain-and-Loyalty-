import { Router } from 'express';

/**
 * Acquire module — CRM-8 lead capture, CRM-20 scoring (Balla); CRM-9 CSV import (Dhriti);
 * CRM-10 assignment (Disha).
 * Endpoints: POST /public/leads (public, rate limited), GET/POST/PATCH/DELETE /leads,
 *            POST /leads/import, POST /leads/assign
 */
export const acquireRouter = Router();
