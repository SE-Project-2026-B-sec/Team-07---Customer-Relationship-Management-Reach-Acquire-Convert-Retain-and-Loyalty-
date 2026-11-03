// CRM-24 (CRM-F-050): request validation for orders and points.
import { z } from 'zod';
import { paginationQuery } from '../../common/pagination';

// POST /orders
export const createOrderBody = z.object({
  contactId: z.string().min(1, 'Pick a customer'),
  amount: z
    .number()
    .positive('Amount must be more than 0')
    .max(10_000_000)
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, {
      message: 'Amount can have at most 2 decimal places',
    }),
  dealId: z.string().min(1).optional(),
  orderedAt: z.coerce.date().optional(),
});
export type CreateOrderBody = z.infer<typeof createOrderBody>;

// GET /orders?contactId=&page=&pageSize=
export const listOrdersQuery = paginationQuery.extend({
  contactId: z.string().min(1).optional(),
});
export type ListOrdersQuery = z.infer<typeof listOrdersQuery>;
