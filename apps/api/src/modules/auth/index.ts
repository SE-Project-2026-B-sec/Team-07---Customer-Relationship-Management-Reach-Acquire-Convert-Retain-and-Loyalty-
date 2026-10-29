/**
 * Auth module (owner: Balla) — CRM-4 login, CRM-5 role checks, CRM-6 user admin (Disha).
 * Endpoints (SAD 4.3): POST /auth/login, GET /auth/me, GET/POST/PATCH /users
 * Other modules protect their routes with authenticate / authorize from ./auth.middleware.
 */
export { authRouter } from './auth.router';
export { authenticate } from './auth.middleware';
