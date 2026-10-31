import type { RequestHandler } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { authenticate } from '../src/modules/auth';

/**
 * TC-SEC-04 / CRM-SR-004: every API route must require login unless it is listed here.
 * If this test fails after you add a route, add `authenticate` (and `authorize(...)`) to it.
 * Only add to this list if the SRS says the endpoint is public.
 */
const PUBLIC_ROUTES = ['GET /api/v1/health', 'POST /api/v1/auth/login'];

interface Layer {
  route?: { path: string; methods: Record<string, boolean>; stack: { handle: RequestHandler }[] };
  handle: RequestHandler & { stack?: Layer[] };
  regexp: RegExp;
}

interface FoundRoute {
  method: string;
  path: string;
  protected: boolean;
}

// Turns the regex Express builds for app.use('/api/v1', router) back into '/api/v1'.
const mountPath = (regexp: RegExp) =>
  regexp.source.replace(/^\^/, '').replace('\\/?(?=\\/|$)', '').replace(/\\\//g, '/');

function collectRoutes(stack: Layer[], prefix = '', inheritedAuth = false): FoundRoute[] {
  const found: FoundRoute[] = [];
  let authSoFar = inheritedAuth;
  for (const layer of stack) {
    if (layer.route) {
      const handlers = layer.route.stack.map((l) => l.handle);
      for (const method of Object.keys(layer.route.methods)) {
        found.push({
          method: method.toUpperCase(),
          path: prefix + layer.route.path,
          protected: authSoFar || handlers.includes(authenticate),
        });
      }
    } else if (layer.handle.stack) {
      found.push(...collectRoutes(layer.handle.stack, prefix + mountPath(layer.regexp), authSoFar));
    } else if (layer.handle === authenticate) {
      authSoFar = true; // router.use(authenticate) protects every route after it
    }
  }
  return found;
}

const app = createApp();
const routes = collectRoutes((app as unknown as { _router: { stack: Layer[] } })._router.stack);
const key = (r: FoundRoute) => `${r.method} ${r.path}`;

describe('TC-SEC-04 every API route requires login', () => {
  it('finds the known routes', () => {
    const keys = routes.map(key);
    expect(keys).toEqual(expect.arrayContaining(['GET /api/v1/health', 'POST /api/v1/auth/login']));
  });

  it('has authenticate on every route that is not public', () => {
    const unprotected = routes.filter((r) => !r.protected && !PUBLIC_ROUTES.includes(key(r)));
    expect(unprotected.map(key)).toEqual([]);
  });

  const protectedRoutes = routes.filter((r) => r.protected);
  it.each(protectedRoutes.map((r) => [key(r), r] as const))(
    '%s returns 401 without a token',
    async (_name, route) => {
      const path = route.path.replace(/:[^/]+/g, '00000000-0000-0000-0000-000000000000');
      const method = route.method.toLowerCase() as 'get' | 'post' | 'patch' | 'put' | 'delete';
      const res = await request(app)[method](path);
      expect(res.status).toBe(401);
    },
  );
});
