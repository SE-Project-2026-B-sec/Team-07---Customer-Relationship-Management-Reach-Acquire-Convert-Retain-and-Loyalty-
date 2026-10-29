import { z } from 'zod';

/** Every list endpoint uses this: default 20 per page, max 100 (CRM-NF-008). */
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .default(20)
    .transform((n) => Math.min(n, 100)),
});

export type Pagination = z.infer<typeof paginationQuery>;

export const toSkipTake = ({ page, pageSize }: Pagination) => ({
  skip: (page - 1) * pageSize,
  take: pageSize,
});

export const paged = <T>(data: T[], total: number, { page, pageSize }: Pagination) => ({
  data,
  page,
  pageSize,
  total,
});
