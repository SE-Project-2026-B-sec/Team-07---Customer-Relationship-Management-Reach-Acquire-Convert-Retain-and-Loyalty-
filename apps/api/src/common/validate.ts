import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';

/**
 * Validate req.body, req.query or req.params with a Zod schema (CRM-SR-005).
 * Usage: router.post('/leads', validate(createLeadSchema), controller.create)
 */
export const validate =
  (schema: ZodTypeAny, part: 'body' | 'query' | 'params' = 'body') =>
  (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) return next(result.error);
    (req as unknown as Record<string, unknown>)[part] = result.data;
    next();
  };
