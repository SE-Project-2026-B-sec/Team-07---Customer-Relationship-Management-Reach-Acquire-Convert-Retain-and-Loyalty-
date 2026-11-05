// CRM-26 (CRM-F-052): request validation for the reward catalogue and redemption.
import { z } from 'zod';

// POST /rewards (ADMIN)
export const createRewardBody = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  pointsCost: z.number().int().min(1, 'Cost must be at least 1 point').max(1_000_000),
  stock: z.number().int().min(0).max(1_000_000).default(0),
  isActive: z.boolean().default(true),
});
export type CreateRewardBody = z.infer<typeof createRewardBody>;

// PATCH /rewards/:id (ADMIN)
export const updateRewardBody = z
  .object({
    name: z.string().trim().min(1).max(120),
    pointsCost: z.number().int().min(1).max(1_000_000),
    stock: z.number().int().min(0).max(1_000_000),
    isActive: z.boolean(),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to update' });
export type UpdateRewardBody = z.infer<typeof updateRewardBody>;

// POST /rewards/:id/redeem
export const redeemBody = z.object({
  contactId: z.string().min(1, 'Pick a customer'),
});
export type RedeemBody = z.infer<typeof redeemBody>;
