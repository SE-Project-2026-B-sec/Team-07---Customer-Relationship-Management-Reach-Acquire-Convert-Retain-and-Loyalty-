// CRM-15: shape of GET /search?q= (see apps/api/src/modules/analytics/search.service.ts).
export interface SearchResults {
  leads: { id: string; name: string; email: string; status: string }[];
  contacts: { id: string; name: string; email: string; phone: string | null }[];
  accounts: { id: string; name: string; industry: string | null }[];
  deals: { id: string; title: string; stage: string }[];
  tickets: { id: string; subject: string; status: string }[];
}

export type SearchGroupKey = keyof SearchResults;

/** One row in the dropdown, built from any of the five result types. */
export interface SearchItem {
  id: string;
  label: string;
  detail: string | null;
}

export interface SearchGroup {
  key: SearchGroupKey;
  title: string;
  /** The list page that opens when a result is clicked (there are no detail pages yet). */
  path: string;
  items: SearchItem[];
}

/** Turns the API response into the groups the dropdown shows, skipping empty ones. */
export function toGroups(r: SearchResults): SearchGroup[] {
  const groups: SearchGroup[] = [
    {
      key: 'leads',
      title: 'Leads',
      path: '/leads',
      items: r.leads.map((x) => ({ id: x.id, label: x.name, detail: x.email })),
    },
    {
      key: 'contacts',
      title: 'Contacts',
      path: '/contacts',
      items: r.contacts.map((x) => ({ id: x.id, label: x.name, detail: x.email })),
    },
    {
      key: 'accounts',
      title: 'Accounts',
      path: '/accounts',
      items: r.accounts.map((x) => ({ id: x.id, label: x.name, detail: x.industry })),
    },
    {
      key: 'deals',
      title: 'Deals',
      path: '/deals',
      items: r.deals.map((x) => ({ id: x.id, label: x.title, detail: x.stage })),
    },
    {
      key: 'tickets',
      title: 'Tickets',
      path: '/tickets',
      items: r.tickets.map((x) => ({ id: x.id, label: x.subject, detail: x.status })),
    },
  ];
  return groups.filter((g) => g.items.length > 0);
}
