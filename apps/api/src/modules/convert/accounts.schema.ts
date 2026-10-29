// CRM-11: request validation for the accounts endpoints.
import { z } from 'zod';
import { MAX_PAGE_SIZE } from './contacts.schema';

// GET /accounts?q=&city=&industry=&page=&pageSize=
export const listAccountsQuery = z.object({
  q: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1).optional(),
  industry: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .default(20)
    .transform((n) => Math.min(n, MAX_PAGE_SIZE)),
});
export type ListAccountsQuery = z.infer<typeof listAccountsQuery>;

// POST /accounts
export const createAccountBody = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  industry: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  website: z.string().trim().url('Enter a full URL, e.g. https://example.com').optional(),
});
export type CreateAccountBody = z.infer<typeof createAccountBody>;

// PATCH /accounts/:id
export const updateAccountBody = createAccountBody.partial();
export type UpdateAccountBody = z.infer<typeof updateAccountBody>;