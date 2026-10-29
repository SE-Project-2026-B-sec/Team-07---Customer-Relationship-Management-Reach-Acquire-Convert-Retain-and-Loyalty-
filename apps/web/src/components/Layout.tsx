import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth, type Role } from '../auth/AuthContext';

interface NavItem {
  to: string;
  label: string;
  /** Roles allowed to see this item. Leave out for "everyone". */
  roles?: Role[];
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/campaigns', label: 'Campaigns', roles: ['ADMIN', 'MARKETING'] },
  { to: '/leads', label: 'Leads', roles: ['ADMIN', 'MARKETING', 'SALES_MANAGER', 'SALES_REP'] },
  { to: '/contacts', label: 'Contacts', roles: ['ADMIN', 'SALES_MANAGER', 'SALES_REP', 'SUPPORT'] },
  { to: '/accounts', label: 'Accounts', roles: ['ADMIN', 'SALES_MANAGER', 'SALES_REP'] },
  { to: '/deals', label: 'Deals', roles: ['ADMIN', 'SALES_MANAGER', 'SALES_REP'] },
  { to: '/tickets', label: 'Tickets', roles: ['ADMIN', 'SUPPORT'] },
  { to: '/loyalty', label: 'Loyalty', roles: ['ADMIN', 'SUPPORT'] },
  { to: '/reports', label: 'Reports', roles: ['ADMIN', 'MARKETING', 'SALES_MANAGER'] },
  { to: '/admin', label: 'Admin', roles: ['ADMIN'] },
];

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin',
  MARKETING: 'Marketing',
  SALES_MANAGER: 'Sales Manager',
  SALES_REP: 'Sales Rep',
  SUPPORT: 'Support',
};

export function Layout() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = NAV.filter((i) => !i.roles || (user !== null && i.roles.includes(user.role)));

  return (
    <div className="flex min-h-screen">
      {menuOpen && (
        <div
          className="fixed inset-0 z-10 bg-black/30 md:hidden"
          aria-hidden="true"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        id="sidebar"
        className={`fixed inset-y-0 left-0 z-20 w-56 shrink-0 transform border-r border-slate-200 bg-white transition-transform md:static md:translate-x-0 ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-5 py-4 text-lg font-semibold text-blue-800">CRM-RACRL</div>
        <nav className="flex flex-col gap-1 px-3" aria-label="Main">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setMenuOpen(false)}
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

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-1 md:hidden"
            aria-label="Toggle menu"
            aria-controls="sidebar"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            ☰
          </button>
          <div className="ml-auto text-sm text-slate-700">
            <span className="font-medium">{user?.name}</span>{' '}
            <span className="text-slate-500">({user ? ROLE_LABEL[user.role] : ''})</span>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100"
          >
            Log out
          </button>
        </header>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
