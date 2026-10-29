// CRM-11 (CRM-F-030): request validation for the contacts endpoints.
import { z } from 'zod';

export const MAX_PAGE_SIZE = 100;

// GET /contacts?q=&city=&accountId=&page=&pageSize=
export const listContactsQuery = z.object({
  q: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1).optional(),
  accountId: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  // Default 20 per page; anything above 100 is capped at 100.
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .default(20)
    .transform((n) => Math.min(n, MAX_PAGE_SIZE)),
});
export type ListContactsQuery = z.infer<typeof listContactsQuery>;

// Fields shared by create and update, without defaults
// (so a PATCH never silently resets tags or consent).
const contactFields = {
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  phone: z.string().trim().max(30).optional(),
  city: z.string().trim().max(80).optional(),
  tags: z.array(z.string().trim().min(1)).max(20),
  marketingConsent: z.boolean(),
  accountId: z.string().min(1).nullable(),
};

// POST /contacts
export const createContactBody = z.object({
  ...contactFields,
  tags: contactFields.tags.default([]),
  marketingConsent: contactFields.marketingConsent.default(false),
  accountId: contactFields.accountId.optional(),
});
export type CreateContactBody = z.infer<typeof createContactBody>;

// PATCH /contacts/:id — every field optional
export const updateContactBody = z.object(contactFields).partial();
export type UpdateContactBody = z.infer<typeof updateContactBody>;