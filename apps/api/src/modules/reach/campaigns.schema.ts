import { CampaignStatus, Channel } from '@prisma/client';
import { z } from 'zod';
import { paginationQuery } from '../../common/pagination';

export const campaignIdParams = z.object({ id: z.string().uuid() });

export const listCampaignsQuery = paginationQuery.extend({
  status: z.nativeEnum(CampaignStatus).optional(),
});

// "2026-12-01" from a date picker, or a full ISO date. null, numbers and rubbish are rejected.
const dateInput = z
  .string()
  .trim()
  .min(1, 'Date is required')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Enter a valid date')
  .transform((v) => new Date(v));

const name = z.string().trim().min(1, 'Name is required').max(120);
const budget = z.number().min(0, 'Budget cannot be negative').max(9_999_999_999);

const END_AFTER_START = {
  message: 'End date must be on or after the start date',
  path: ['endDate'],
};

export const createCampaignSchema = z
  .object({
    name,
    channel: z.nativeEnum(Channel),
    budget,
    startDate: dateInput,
    endDate: dateInput,
    segmentId: z.string().uuid().nullish(),
    // A valid campaign is saved as Scheduled unless the user asks for a draft.
    status: z.enum(['DRAFT', 'SCHEDULED']).default('SCHEDULED'),
  })
  .refine((c) => c.endDate >= c.startDate, END_AFTER_START);

export const updateCampaignSchema = z
  .object({
    name: name.optional(),
    channel: z.nativeEnum(Channel).optional(),
    budget: budget.optional(),
    startDate: dateInput.optional(),
    endDate: dateInput.optional(),
    segmentId: z.string().uuid().nullable().optional(),
    // Running and Completed are set by sending the campaign (CRM-19), not by editing.
    status: z.enum(['DRAFT', 'SCHEDULED', 'ARCHIVED']).optional(),
  })
  .refine((c) => Object.values(c).some((v) => v !== undefined), {
    message: 'Provide at least one field to change',
  })
  .refine((c) => !(c.startDate && c.endDate) || c.endDate >= c.startDate, END_AFTER_START);

export type ListCampaignsQuery = z.infer<typeof listCampaignsQuery>;
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
