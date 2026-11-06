// CRM-30 (CRM-F-034, SAD: POST /deals/{id}/quote): quotes on a deal, and their PDF.
import { Router } from 'express';
import { validate } from '../../common/validate';
import { authenticate, authorize, SALES_TEAM } from '../auth';
import { dealIdParams } from './deals.schema';
import { quotesController as c } from './quotes.controller';
import { createQuoteSchema, quoteIdParams } from './quotes.schema';

const salesOnly = [authenticate, authorize(...SALES_TEAM)];

export const quotesRouter = Router();

quotesRouter.get('/deals/:id/quotes', ...salesOnly, validate(dealIdParams, 'params'), c.list);
quotesRouter.post(
  '/deals/:id/quotes',
  ...salesOnly,
  validate(dealIdParams, 'params'),
  validate(createQuoteSchema),
  c.create,
);
quotesRouter.get('/quotes/:id/pdf', ...salesOnly, validate(quoteIdParams, 'params'), c.pdf);
