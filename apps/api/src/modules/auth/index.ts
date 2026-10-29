import { Router } from 'express';

/**
 * Auth module (owner: Balla) — CRM-4 login, CRM-5 role checks, CRM-6 user admin (Disha).
 * Endpoints (SAD 4.3): POST /auth/login, GET /auth/me, GET/POST/PATCH /users
 * Suggested files: auth.router.ts, auth.controller.ts, auth.service.ts, auth.repository.ts,
 * auth.schema.ts, and middleware authenticate() / authorize(roles) for every other module.
 */
export const authRouter = Router();
