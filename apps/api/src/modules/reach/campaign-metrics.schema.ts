import { z } from 'zod';

/** Demo only: how many unique recipients should have opened and clicked in total. */
export const simulateSchema = z
  .object({
    opens: z.number().int().min(0).max(1_000_000),
    clicks: z.number().int().min(0).max(1_000_000),
  })
  .refine((s) => s.clicks <= s.opens, {
    message: 'Clicks cannot be more than opens',
    path: ['clicks'],
  });

export type SimulateInput = z.infer<typeof simulateSchema>;
