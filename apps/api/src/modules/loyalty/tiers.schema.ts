// CRM-25 (CRM-F-051): request validation for loyalty tiers.
import { z } from 'zod';

// PATCH /tiers/:name — ADMIN changes a threshold
export const updateTierBody = z.object({
  minPoints: z.number().int().min(0).max(10_000_000),
});
export type UpdateTierBody = z.infer<typeof updateTierBody>;
