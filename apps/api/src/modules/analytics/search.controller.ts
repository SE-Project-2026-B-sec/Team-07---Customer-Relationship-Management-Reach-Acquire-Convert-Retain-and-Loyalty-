// apps/api/src/modules/analytics/search.controller.ts
import type { Request, Response } from 'express';
import { AppError } from '../../common/errors';
import { globalSearch } from './search.service';
import { verifyToken } from '../auth/auth.service';

/**
 * GET /search?q=...  (mounted at /api/v1/analytics)
 * Query must be at least 2 characters.
 */
export async function searchHandler(req: Request, res: Response) {
  const q = (req.query.q ?? '').toString().trim();
  if (q.length < 2) {
    throw new AppError(400, 'INVALID_QUERY', 'Search query must be at least 2 characters');
  }
  // Verify token (auth middleware already added, but we need the user info)
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Missing Authorization header');
  }
  const token = authHeader.split(' ')[1];
  const user = verifyToken(token);

  const results = await globalSearch(q, user);
  res.json(results);
}
