import { createLeadSchema } from './leads.schema';
import { createLead } from './leads.service';

export interface RowError {
  /** 1 = the first lead row under the header. */
  row: number;
  email: string | null;
  reason: string;
}

export interface ImportReport {
  received: number;
  /** Rows saved, including the ones flagged as duplicates. */
  imported: number;
  /** Saved rows whose email already belongs to another lead or a contact. */
  duplicates: number;
  rejected: number;
  errors: RowError[];
}

const text = (value: unknown) => (typeof value === 'string' ? value : undefined);

/**
 * CRM-9: every row goes through the same rules as manual entry (createLeadSchema) and is saved with
 * createLead(), so duplicates are flagged the same way everywhere.
 */
export async function importLeads(rows: Record<string, unknown>[]): Promise<ImportReport> {
  const report: ImportReport = {
    received: rows.length,
    imported: 0,
    duplicates: 0,
    rejected: 0,
    errors: [],
  };
  const reject = (index: number, email: string | null, reason: string) => {
    report.rejected++;
    report.errors.push({ row: index + 1, email, reason });
  };

  // One row at a time (not in parallel), so a duplicate email later in the same file is flagged too.
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i] ?? {};
    const email = text(raw.email)?.trim() || null;
    const parsed = createLeadSchema.safeParse({
      name: text(raw.name) ?? '',
      email: text(raw.email) ?? '',
      phone: text(raw.phone),
      company: text(raw.company),
      source: 'IMPORT',
    });
    if (!parsed.success) {
      const reasons = new Set(
        parsed.error.issues.map((issue) =>
          issue.path[0] === 'phone' ? 'Enter a valid phone number' : issue.message,
        ),
      );
      reject(i, email, [...reasons].join('; '));
      continue;
    }
    try {
      const lead = await createLead(parsed.data);
      report.imported++;
      if (lead.isDuplicate) report.duplicates++;
    } catch {
      reject(i, email, 'Could not save this row');
    }
  }
  return report;
}
