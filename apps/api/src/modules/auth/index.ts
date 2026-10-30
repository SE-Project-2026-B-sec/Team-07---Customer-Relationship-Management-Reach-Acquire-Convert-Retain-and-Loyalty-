/**
 * Auth module (owner: Balla) — CRM-4 login, CRM-5 role checks, CRM-6 user admin (Disha).
 * Endpoints (SAD 4.3): POST /auth/login, GET /auth/me, GET/POST/PATCH /users
 *
 * Protect routes in other modules with:
 *   import { authenticate, authorize, SALES_TEAM, ownedBy, assertCanModify } from '../auth';
 */
export { authRouter } from './auth.router';
export { authenticate, authorize } from './auth.middleware';
export { assertCanModify, ownedBy } from './ownership';
export * from './roles';
export type { AuthUser } from './auth.service';
