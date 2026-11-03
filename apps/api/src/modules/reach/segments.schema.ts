import { TierName } from '@prisma/client';
import { z } from 'zod';
import { paginationQuery } from '../../common/pagination';

export const segmentIdParams = z.object({ id: z.string().uuid() });

// Accepts "Bengaluru" or ["Bengaluru", "Mumbai"]; always stored as a clean, de-duplicated list.
const textList = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : [v]))
  .transform((v) => [...new Set(v.map((s) => s.trim()).filter(Boolean))])
  .pipe(z.array(z.string().max(60)).max(50));

const days = z.number().int().min(1).max(3650);

/**
 * CRM-F-011 filter rules. Every rule is optional; a contact must match all the rules given.
 * Contacts without marketing consent are always excluded (CRM-SR-007), so there is no rule for it.
 */
export const segmentFilterSchema = z
  .object({
    cities: textList.optional(),
    tiers: z.array(z.nativeEnum(TierName)).max(4).optional(),
    tags: textList.optional(),
    orderedWithinDays: days.optional(),
    noOrderForDays: days.optional(),
  })
  .strict()
  .refine((f) => !(f.orderedWithinDays && f.noOrderForDays), {
    message: 'Choose either "ordered in the last N days" or "no order for N days", not both',
    path: ['noOrderForDays'],
  });

const name = z.string().trim().min(1, 'Name is required').max(120);

export const createSegmentSchema = z.object({ name, filter: segmentFilterSchema });

export const updateSegmentSchema = z
  .object({ name: name.optional(), filter: segmentFilterSchema.optional() })
  .refine((s) => s.name !== undefined || s.filter !== undefined, {
    message: 'Provide a name or a filter to change',
  });

export const previewSchema = z.object({ filter: segmentFilterSchema });

export const listSegmentsQuery = paginationQuery;
export const audienceQuery = paginationQuery;

export type SegmentFilter = z.infer<typeof segmentFilterSchema>;
export type CreateSegmentInput = z.infer<typeof createSegmentSchema>;
export type UpdateSegmentInput = z.infer<typeof updateSegmentSchema>;
export type ListSegmentsQuery = z.infer<typeof listSegmentsQuery>;
