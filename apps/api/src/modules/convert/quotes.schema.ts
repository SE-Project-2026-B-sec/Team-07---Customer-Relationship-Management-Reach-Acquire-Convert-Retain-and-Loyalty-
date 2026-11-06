import { z } from 'zod';

// Money in rupees with at most 2 decimal places (paise), like order amounts (CRM-24).
const rupees = z
  .number()
  .min(0)
  .max(100_000_000)
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, {
    message: 'Use at most 2 decimal places',
  });

export const quoteItemSchema = z.object({
  description: z.string().trim().min(1, 'Describe the item').max(200),
  quantity: z.number().int().min(1).max(100_000),
  unitPrice: rupees,
});

// POST /deals/:id/quotes (CRM-F-034)
export const createQuoteSchema = z.object({
  items: z.array(quoteItemSchema).min(1, 'Add at least one item').max(50),
  discountPct: z.number().min(0).max(100).default(0),
});

export const quoteIdParams = z.object({ id: z.string().uuid() });

export type QuoteItem = z.infer<typeof quoteItemSchema>;
export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
