// CRM-29: CSV export of list and report views (CRM-F-062 / TC-ANA-03).
// Each export reuses the list's own service, so it applies the same filters and the same
// role/ownership rules as the screen, and the row count always equals the list total.
import type { Role } from '@prisma/client';
import { AppError } from '../../common/errors';
import { listLeadsQuery } from '../acquire/leads.schema';
import { leadsService } from '../acquire/leads.service';
import type { AuthUser } from '../auth';
import { listContactsQuery } from '../convert/contacts.schema';
import { contactsService } from '../convert/contacts.service';
import { listDealsQuery } from '../convert/deals.schema';
import { dealsService } from '../convert/deals.service';
import { listTicketsQuery } from '../retain/tickets.schema';
import { ticketsService } from '../retain/tickets.service';
import { type CsvColumn, toCsv } from './csv';
import { type FunnelStage, funnelService } from './funnel.service';
import { type ExportName, funnelQuery } from './reports.schema';

/** Biggest export in one file. Lists are read 100 rows at a time (CRM-NF-008). */
export const MAX_EXPORT_ROWS = 10_000;
const PAGE = 100;

type Page<T> = { rows: T[]; total: number };

/** Reads every page of a list, up to MAX_EXPORT_ROWS rows. */
async function readAll<T>(fetchPage: (page: number) => Promise<Page<T>>) {
  const first = await fetchPage(1);
  if (first.total > MAX_EXPORT_ROWS) {
    throw new AppError(
      400,
      'EXPORT_TOO_LARGE',
      `This list has ${first.total} rows; narrow the filters to ${MAX_EXPORT_ROWS} or fewer`,
    );
  }
  const rows = [...first.rows];
  for (let page = 2; rows.length < first.total; page++) {
    const next = await fetchPage(page);
    if (next.rows.length === 0) break;
    rows.push(...next.rows);
  }
  return rows;
}

interface ExportDef<T> {
  roles: Role[];
  load: (user: AuthUser, query: Record<string, unknown>) => Promise<T[]>;
  columns: CsvColumn<T>[];
}

const def = <T>(d: ExportDef<T>) => d as unknown as ExportDef<unknown>;

const EXPORTS: Record<ExportName, ExportDef<unknown>> = {
  leads: def({
    roles: ['ADMIN', 'MARKETING', 'SALES_MANAGER', 'SALES_REP'],
    load: (user, query) =>
      readAll(async (page) => {
        const res = await leadsService.list(
          user,
          listLeadsQuery.parse({ ...query, page, pageSize: PAGE }),
        );
        return { rows: res.data, total: res.total };
      }),
    columns: [
      { header: 'Name', value: (l) => l.name },
      { header: 'Email', value: (l) => l.email },
      { header: 'Phone', value: (l) => l.phone },
      { header: 'Company', value: (l) => l.company },
      { header: 'Source', value: (l) => l.source },
      { header: 'Status', value: (l) => l.status },
      { header: 'Score', value: (l) => l.score },
      { header: 'Duplicate', value: (l) => l.isDuplicate },
      { header: 'Owner', value: (l) => l.ownerName },
      { header: 'Campaign', value: (l) => l.campaignName },
      { header: 'Created', value: (l) => l.createdAt },
    ],
  }),

  contacts: def({
    roles: ['ADMIN', 'SALES_MANAGER', 'SALES_REP', 'SUPPORT'],
    load: (user, query) =>
      readAll(async (page) => {
        const res = await contactsService.list(
          user,
          listContactsQuery.parse({ ...query, page, pageSize: PAGE }),
        );
        return { rows: res.items, total: res.total };
      }),
    columns: [
      { header: 'Name', value: (c) => c.name },
      { header: 'Email', value: (c) => c.email },
      { header: 'Phone', value: (c) => c.phone },
      { header: 'City', value: (c) => c.city },
      { header: 'Account', value: (c) => c.account?.name },
      { header: 'Tier', value: (c) => c.tier },
      { header: 'Marketing consent', value: (c) => c.marketingConsent },
      { header: 'Tags', value: (c) => c.tags.join('; ') },
      { header: 'Created', value: (c) => c.createdAt },
    ],
  }),

  deals: def({
    roles: ['ADMIN', 'SALES_MANAGER', 'SALES_REP'],
    load: (user, query) =>
      readAll(async (page) => {
        const res = await dealsService.list(
          user,
          listDealsQuery.parse({ ...query, page, pageSize: PAGE }),
        );
        return { rows: res.data, total: res.total };
      }),
    columns: [
      { header: 'Title', value: (d) => d.title },
      { header: 'Value', value: (d) => d.value },
      { header: 'Stage', value: (d) => d.stage },
      { header: 'Contact', value: (d) => d.contactName },
      { header: 'Owner', value: (d) => d.ownerName },
      { header: 'Expected close', value: (d) => d.expectedClose },
      { header: 'Won at', value: (d) => d.wonAt },
      { header: 'Created', value: (d) => d.createdAt },
    ],
  }),

  tickets: def({
    roles: ['ADMIN', 'SUPPORT', 'SALES_MANAGER'],
    load: (_user, query) =>
      readAll(async (page) => {
        const res = await ticketsService.list(
          listTicketsQuery.parse({ ...query, page, pageSize: PAGE }),
        );
        return { rows: res.data, total: res.total };
      }),
    columns: [
      { header: 'Subject', value: (t) => t.subject },
      { header: 'Customer', value: (t) => t.contactName },
      { header: 'Priority', value: (t) => t.priority },
      { header: 'Status', value: (t) => t.status },
      { header: 'SLA due', value: (t) => t.slaDueAt },
      { header: 'SLA breached', value: (t) => t.breached },
      { header: 'Resolved at', value: (t) => t.resolvedAt },
      { header: 'Assignee', value: (t) => t.assigneeName },
      { header: 'Created', value: (t) => t.createdAt },
    ],
  }),

  funnel: def<FunnelStage>({
    roles: ['ADMIN', 'MARKETING', 'SALES_MANAGER'],
    load: async (_user, query) => (await funnelService.funnel(funnelQuery.parse(query))).stages,
    columns: [
      { header: 'Stage', value: (s) => s.label },
      { header: 'Count', value: (s) => s.count },
      { header: 'Conversion from previous (%)', value: (s) => s.conversionRate },
      { header: 'Drop-off from previous (%)', value: (s) => s.dropOff },
    ],
  }),
};

export const exportService = {
  /** Builds the CSV for one export, or throws 403 if the role may not see that list. */
  async toCsv(name: ExportName, user: AuthUser, query: Record<string, unknown>) {
    const exp = EXPORTS[name];
    if (!exp.roles.includes(user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have access to this list');
    }
    const rows = await exp.load(user, query);
    return { csv: toCsv(exp.columns, rows), rows: rows.length };
  },
};
