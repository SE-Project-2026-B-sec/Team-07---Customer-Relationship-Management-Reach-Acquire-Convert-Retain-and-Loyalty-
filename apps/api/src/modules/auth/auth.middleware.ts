import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../common/errors';
import { type AuthUser, verifyToken } from './auth.service';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by authenticate(): the logged-in user's id and role. */
      user?: AuthUser;
    }
  }
}

/**
 * Requires a valid "Authorization: Bearer <token>" header and sets req.user = { id, role }.
 * Usage: router.get('/contacts', authenticate, controller.list)
 */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError(401, 'UNAUTHENTICATED', 'Please log in'));
  }
  try {
    req.user = verifyToken(header.slice('Bearer '.length).trim());
    next();
  } catch (err) {
    next(err);
  }
}

// authorize(...roles) is added in CRM-5.
