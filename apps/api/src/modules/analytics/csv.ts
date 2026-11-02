// CRM-29: tiny CSV writer (RFC 4180) with spreadsheet formula protection.

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

/**
 * Text starting with = + - @ (or a tab/carriage return) can run as a formula when the file is
 * opened in Excel or Sheets ("CSV injection"), so it gets a leading apostrophe. Real numbers
 * are left alone, so a negative amount stays a number.
 */
function protect(text: string) {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const text = protect(value instanceof Date ? value.toISOString() : String(value));
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Header line plus one line per row, joined with CRLF as RFC 4180 expects. */
export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(c.value(row))).join(','));
  return `${lines.join('\r\n')}\r\n`;
}
