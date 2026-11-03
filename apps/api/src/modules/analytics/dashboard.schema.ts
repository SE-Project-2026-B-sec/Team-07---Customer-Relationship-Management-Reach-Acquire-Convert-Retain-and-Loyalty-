import { z } from 'zod';

const dateText = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Enter a valid date');

export const kpiQuery = z.object({
  from: dateText.optional(),
  to: dateText.optional(),
});

export type KpiQuery = z.infer<typeof kpiQuery>;
