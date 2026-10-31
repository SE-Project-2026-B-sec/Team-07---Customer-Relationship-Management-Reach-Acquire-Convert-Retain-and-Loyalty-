import { parse } from 'papaparse';

export const MAX_IMPORT_ROWS = 1000;
/** Rows sent per request, to stay well under the API's default 100 KB request size. */
export const BATCH_SIZE = 200;

export const LEAD_CSV_TEMPLATE =
  'name,email,phone,company\nPriya Sharma,priya@example.com,+91 98765 43210,Sharma Traders\n';

export interface ImportRow {
  name: string;
  email: string;
  phone?: string;
  company?: string;
}

export interface RowError {
  row: number;
  email: string | null;
  reason: string;
}

export interface ImportReport {
  received: number;
  imported: number;
  duplicates: number;
  rejected: number;
  errors: RowError[];
}

export type ParsedCsv = { ok: true; rows: ImportRow[] } | { ok: false; error: string };

/** Reads the CSV text. Column names are matched ignoring case, spaces and a leading BOM. */
export function parseLeadsCsv(text: string): ParsedCsv {
  const parsed = parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) =>
      header
        .replace(/^\uFEFF/, '')
        .trim()
        .toLowerCase(),
  });

  const fields = parsed.meta.fields ?? [];
  const missing = ['name', 'email'].filter((f) => !fields.includes(f));
  if (missing.length > 0) {
    return {
      ok: false,
      error: `The first row of the file must have a "${missing.join('" and a "')}" column.`,
    };
  }
  if (parsed.data.length === 0) return { ok: false, error: 'The file has no lead rows.' };
  if (parsed.data.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      error: `The file has ${parsed.data.length} rows. The limit is ${MAX_IMPORT_ROWS.toLocaleString('en-IN')} per import, so split it into smaller files.`,
    };
  }

  const rows = parsed.data.map((r): ImportRow => {
    const clean = (value?: string) => value?.trim() ?? '';
    const phone = clean(r.phone);
    const company = clean(r.company);
    return {
      name: clean(r.name),
      email: clean(r.email),
      ...(phone ? { phone } : {}),
      ...(company ? { company } : {}),
    };
  });
  return { ok: true, rows };
}
