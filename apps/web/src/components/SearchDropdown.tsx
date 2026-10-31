// apps/web/src/components/SearchDropdown.tsx
import { useNavigate } from 'react-router-dom';

/**
 * Render grouped search results. Clicking an item navigates to its detail page.
 */
export function SearchDropdown({ results, onSelect }: { results: any; onSelect: () => void }) {
  const navigate = useNavigate();

  const handleClick = (path: string) => {
    navigate(path);
    onSelect();
  };

  const groups = [
    { label: 'Leads', items: results.leads, pathBase: '/leads' },
    { label: 'Contacts', items: results.contacts, pathBase: '/contacts' },
    { label: 'Accounts', items: results.accounts, pathBase: '/accounts' },
    { label: 'Deals', items: results.deals, pathBase: '/deals' },
    { label: 'Tickets', items: results.tickets, pathBase: '/tickets' },
  ];

  const anyResults = groups.some((g) => g.items && g.items.length > 0);

  return (
    <div className="absolute left-0 top-full z-10 w-96 rounded border border-slate-200 bg-white shadow-lg">
      {anyResults ? (
        groups.map(
          (g) =>
            g.items && g.items.length > 0 && (
              <div key={g.label} className="border-b last:border-b-0 py-2 px-3">
                <div className="font-medium text-slate-600 mb-1">{g.label}</div>
                {g.items.map((item: any) => (
                  <div
                    key={item.id}
                    className="cursor-pointer rounded px-2 py-1 hover:bg-slate-100"
                    onClick={() => handleClick(`${g.pathBase}/${item.id}`)}
                  >
                    {item.name ?? item.email ?? item.subject ?? 'Unnamed'}
                  </div>
                ))}
              </div>
            ),
        )
      ) : (
        <div className="p-3 text-sm text-slate-500">No results</div>
      )}
    </div>
  );
}
