// CRM-29: request validation for the funnel report and CSV export.
import { z } from 'zod';

/** "2026-11-02" from a date picker. */
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Enter a valid date');

export const funnelQuery = z
  .object({ from: day.optional(), to: day.optional() })
  .refine((q) => !(q.from && q.to) || q.from <= q.to, {
    message: 'From date must be on or before the To date',
    path: ['to'],
  });

export type FunnelQuery = z.infer<typeof funnelQuery>;

export const EXPORT_NAMES = ['leads', 'contacts', 'deals', 'tickets', 'funnel'] as const;
export type ExportName = (typeof EXPORT_NAMES)[number];

export const exportParams = z.object({ name: z.enum(EXPORT_NAMES) });
