import type { NextFunction, Request, Response } from 'express';
import type { LoginInput } from './auth.schema';
import { getCurrentUser, login } from './auth.service';

export async function loginHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await login(req.body as LoginInput));
  } catch (err) {
    next(err);
  }
}

export async function meHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await getCurrentUser(req.user!.id));
  } catch (err) {
    next(err);
  }
}
