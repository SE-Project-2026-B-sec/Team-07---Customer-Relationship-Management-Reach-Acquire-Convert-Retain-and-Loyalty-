// apps/api/src/modules/analytics/search.router.ts
import { Router } from 'express';
import { searchHandler } from './search.controller';
import { authorize } from '../auth/auth.middleware'; // existing helper

export const searchRouter = Router();

// All users must be authenticated – auth middleware is applied globally in app.ts
// Additional role restrictions can be added here if needed.
searchRouter.get('/search', authorize(), searchHandler);
