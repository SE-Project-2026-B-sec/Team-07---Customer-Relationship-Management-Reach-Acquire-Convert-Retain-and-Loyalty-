// CRM-13 (CRM-F-032): request body for POST /leads/:id/convert.
import { z } from 'zod';

export const convertLeadBody = z
  .object({
    accountId: z.string().min(1).optional(),
    accountName: z.string().trim().min(1).max(120).optional(),
    createDeal: z.boolean().default(false),
    dealTitle: z.string().trim().min(1).max(160).optional(),
    // Not limited to >= 0 here on purpose: the service rejects a negative value
    // INSIDE the transaction, which is how TC-CONV-06 proves the rollback works.
    dealValue: z.number().optional(),
  })
  .refine((b) => b.accountId || b.accountName, {
    message: 'Pick an existing account or enter a new account name',
    path: ['accountName'],
  });

export type ConvertLeadBody = z.infer<typeof convertLeadBody>;
