// CRM-31: remembers the current HTTP request for the rest of its async work, so code far from
// the route (like the audit hook in audit.ts) can tell who is making a change.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request, RequestHandler } from 'express';

const storage = new AsyncLocalStorage<{ req: Request }>();

/** Add once in app.ts, before the routes. */
export const requestContext: RequestHandler = (req, _res, next) => storage.run({ req }, next);

/** The request being handled, or undefined outside a request (seed script, tests, jobs). */
export const currentRequest = (): Request | undefined => storage.getStore()?.req;
