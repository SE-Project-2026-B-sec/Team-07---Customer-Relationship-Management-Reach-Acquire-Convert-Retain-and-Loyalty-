import { Router } from 'express';

/**
 * Convert module — CRM-11 contacts and accounts, CRM-13 convert lead (Disha);
 * CRM-12 deal pipeline, CRM-14 activities (Dhriti); CRM-30 quote PDF (Balla).
 * Endpoints: CRUD /contacts, /accounts, /deals, /activities; PATCH /deals/:id/stage;
 *            POST /leads/:id/convert; POST /deals/:id/quote
 */
export const convertRouter = Router();
