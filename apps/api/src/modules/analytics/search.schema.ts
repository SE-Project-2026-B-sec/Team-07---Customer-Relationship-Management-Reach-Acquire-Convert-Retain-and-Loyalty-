// CRM-15: request validation for GET /search?q=
import { z } from 'zod';

export const MIN_QUERY_LENGTH = 2;

// Fewer than 2 characters (after trimming) -> 400 from the validate() middleware.
export const searchQuery = z.object({
  q: z.string().trim().min(MIN_QUERY_LENGTH, `Enter at least ${MIN_QUERY_LENGTH} characters`),
});
export type SearchQuery = z.infer<typeof searchQuery>;
