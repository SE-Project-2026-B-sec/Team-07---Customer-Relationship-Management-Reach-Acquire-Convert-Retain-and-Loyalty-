import { usersRouter } from './users.router';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../common/validate';
import { loginHandler, meHandler } from './auth.controller';
import { authenticate } from './auth.middleware';
import { loginSchema } from './auth.schema';

// CRM-SR-006: at most 100 login attempts per minute from one IP.
const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again in a minute' } },
});

export const authRouter = Router();

authRouter.post('/auth/login', loginLimiter, validate(loginSchema), loginHandler);
authRouter.get('/auth/me', authenticate, meHandler);
authRouter.use('/users', usersRouter); // CRM-6
