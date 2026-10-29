import { NavLink, Outlet } from 'react-router-dom';

export const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/campaigns', label: 'Campaigns' },
  { to: '/leads', label: 'Leads' },
  { to: '/contacts', label: 'Contacts' },
  { to: '/accounts', label: 'Accounts' },
  { to: '/deals', label: 'Deals' },
  { to: '/tickets', label: 'Tickets' },
  { to: '/loyalty', label: 'Loyalty' },
  { to: '/reports', label: 'Reports' },
  { to: '/admin', label: 'Admin' },
];

export function Layout() {
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-slate-200 bg-white">
        <div className="px-5 py-4 text-lg font-semibold text-blue-800">CRM-RACRL</div>
        <nav className="flex flex-col gap-1 px-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `rounded px-3 py-2 text-sm ${
                  isActive
                    ? 'bg-blue-50 font-medium text-blue-800'
                    : 'text-slate-700 hover:bg-slate-100'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
