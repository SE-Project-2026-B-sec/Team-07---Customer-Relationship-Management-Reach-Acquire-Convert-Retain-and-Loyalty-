import { z } from 'zod';

export const MAX_IMPORT_ROWS = 1000;

/** The browser reads the CSV and sends its rows as JSON. The service checks each row separately. */
export const importLeadsBody = z.object({
  rows: z
    .array(z.record(z.string(), z.unknown()))
    .min(1, 'The file has no rows')
    .max(MAX_IMPORT_ROWS, `Import at most ${MAX_IMPORT_ROWS} leads at a time`),
});

export type ImportLeadsBody = z.infer<typeof importLeadsBody>;
