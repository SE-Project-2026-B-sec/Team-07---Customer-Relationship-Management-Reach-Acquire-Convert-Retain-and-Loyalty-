// CRM-15: GET /search?q= (any logged-in user; the service limits what each role sees).
import { Router } from 'express';
import { validate } from '../../common/validate';
import { authenticate } from '../auth';
import { searchController } from './search.controller';
import { searchQuery } from './search.schema';

export const searchRouter = Router();

searchRouter.get('/search', authenticate, validate(searchQuery, 'query'), searchController.search);
