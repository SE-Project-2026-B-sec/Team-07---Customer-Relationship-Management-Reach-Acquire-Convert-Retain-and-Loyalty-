import { ActivityType } from '@prisma/client';
import { z } from 'zod';
import { paginationQuery } from '../../common/pagination';

export const activityIdParams = z.object({ id: z.string().uuid() });

// Query strings arrive as text, so "false" must not become true (z.coerce.boolean would do that).
const flag = z.enum(['true', 'false']).transform((v) => v === 'true');

export const listActivitiesQuery = paginationQuery.extend({
  leadId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
  mine: flag.optional(),
  overdue: flag.optional(),
});

export const createActivitySchema = z
  .object({
    type: z.nativeEnum(ActivityType),
    subject: z.string().trim().min(1).max(200),
    notes: z.string().trim().max(2000).nullish(),
    dueAt: z.coerce.date().nullish(),
    leadId: z.string().uuid().optional(),
    contactId: z.string().uuid().optional(),
    dealId: z.string().uuid().optional(),
  })
  .refine((a) => [a.leadId, a.contactId, a.dealId].filter(Boolean).length === 1, {
    message: 'Link the activity to exactly one of leadId, contactId or dealId',
    path: ['dealId'],
  });

export const updateActivitySchema = z
  .object({
    type: z.nativeEnum(ActivityType).optional(),
    subject: z.string().trim().min(1).max(200).optional(),
    notes: z.string().trim().max(2000).nullish(),
    dueAt: z.coerce.date().nullish(),
    done: z.boolean().optional(),
  })
  .refine((a) => Object.values(a).some((v) => v !== undefined), {
    message: 'Provide at least one field to change',
  });

export type ListActivitiesQuery = z.infer<typeof listActivitiesQuery>;
export type CreateActivityInput = z.infer<typeof createActivitySchema>;
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;
