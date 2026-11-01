// CRM-15: global search. Decides WHICH record types a role may see, then queries only those.
// Business rules (SRS / CRM-F-030):
//   - A Sales Rep only gets their own leads, contacts and deals.
//   - Support gets contacts and tickets.
//   - Every response has all five keys; types a role may not see come back as [].
import type { Role } from '@prisma/client';
import { ownedBy, type AuthUser } from '../auth';
import { searchRepository as repo } from './search.repository';

type SearchType = 'leads' | 'contacts' | 'accounts' | 'deals' | 'tickets';

const ALL_TYPES: SearchType[] = ['leads', 'contacts', 'accounts', 'deals', 'tickets'];

const TYPES_BY_ROLE: Record<Role, SearchType[]> = {
  ADMIN: ALL_TYPES,
  SALES_MANAGER: ALL_TYPES,
  SALES_REP: ['leads', 'contacts', 'deals'],
  MARKETING: ['leads'],
  SUPPORT: ['contacts', 'tickets'],
};

export const searchService = {
  async search(user: AuthUser, q: string) {
    const allowed = new Set(TYPES_BY_ROLE[user.role]);
    const owner = ownedBy(user);
    // Run only the allowed queries, all at the same time.
    const run = <T>(type: SearchType, query: () => Promise<T[]>): Promise<T[]> =>
      allowed.has(type) ? query() : Promise.resolve([]);

    const [leads, contacts, accounts, deals, tickets] = await Promise.all([
      run('leads', () => repo.leads(q, owner)),
      run('contacts', () => repo.contacts(q, owner)),
      run('accounts', () => repo.accounts(q)),
      run('deals', () => repo.deals(q, owner)),
      run('tickets', () => repo.tickets(q)),
    ]);
    return { leads, contacts, accounts, deals, tickets };
  },
};
