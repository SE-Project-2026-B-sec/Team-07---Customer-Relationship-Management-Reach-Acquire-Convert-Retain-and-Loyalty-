import { DealStage } from '@prisma/client';
import { z } from 'zod';
import { paginationQuery } from '../../common/pagination';

export const dealIdParams = z.object({ id: z.string().uuid() });

export const listDealsQuery = paginationQuery.extend({
  stage: z.nativeEnum(DealStage).optional(),
});

export const createDealSchema = z.object({
  title: z.string().trim().min(1).max(200),
  value: z.coerce.number().min(0).max(9_999_999_999),
  contactId: z.string().uuid(),
  expectedClose: z.coerce.date().nullish(),
});

export const updateDealSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    value: z.coerce.number().min(0).max(9_999_999_999).optional(),
    expectedClose: z.coerce.date().nullish(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: 'Provide at least one field to change',
  });

export const moveStageSchema = z.object({ stage: z.nativeEnum(DealStage) });

export const contactSearchQuery = z.object({ search: z.string().trim().max(100).optional() });

export type ListDealsQuery = z.infer<typeof listDealsQuery>;
export type CreateDealInput = z.infer<typeof createDealSchema>;
export type UpdateDealInput = z.infer<typeof updateDealSchema>;
export type MoveStageInput = z.infer<typeof moveStageSchema>;
