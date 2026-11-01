import { LeadStatus } from '@prisma/client';
import { z } from 'zod';
import { paginationQuery } from '../../common/pagination';

const name = z.string().trim().min(1, 'Name is required').max(120);
const email = z.string().trim().toLowerCase().email('Enter a valid email').max(200);
const phone = z
  .string()
  .trim()
  .max(30)
  .regex(/^[+\d][\d\s-]{6,}$/, 'Enter a valid phone number')
  .optional()
  .or(z.literal('').transform(() => undefined));
const company = z.string().trim().max(120).optional();

export const LEAD_SOURCES = ['WEB', 'MANUAL', 'IMPORT', 'REFERRAL', 'CAMPAIGN'] as const;

export const leadIdParams = z.object({ id: z.string().uuid() });

/** CRM-F-020: what a website visitor submits. `website` is a hidden honeypot field (CRM-SR-006). */
export const publicLeadSchema = z.object({
  name,
  email,
  phone,
  company,
  campaignId: z.string().uuid().optional(),
  website: z.string().max(200).optional(),
});

/** Manual entry by a logged-in user. */
export const createLeadSchema = z.object({
  name,
  email,
  phone,
  company,
  source: z.enum(LEAD_SOURCES).default('MANUAL'),
  campaignId: z.string().uuid().optional(),
});

/** CONVERTED is only set by "Convert lead" (CRM-13), never by hand. */
export const updateLeadSchema = z
  .object({
    name: name.optional(),
    email: email.optional(),
    phone: phone.nullable(),
    company: company.nullable(),
    status: z
      .nativeEnum(LeadStatus)
      .refine((s) => s !== 'CONVERTED', 'Use "Convert lead" to convert a lead')
      .optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: 'Provide at least one field to change',
  });

export const listLeadsQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  status: z.nativeEnum(LeadStatus).optional(),
  source: z.enum(LEAD_SOURCES).optional(),
  duplicates: z.enum(['true', 'false']).optional(),
});

export type PublicLeadInput = z.infer<typeof publicLeadSchema>;
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type ListLeadsQuery = z.infer<typeof listLeadsQuery>;
