import { z } from 'zod';

export const customerIdParams = z.object({ id: z.string().uuid() });

export const customer360Query = z.object({
  /** Most recent items to return from each kind (default 100, at most 500). */
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export type Customer360Query = z.infer<typeof customer360Query>;
