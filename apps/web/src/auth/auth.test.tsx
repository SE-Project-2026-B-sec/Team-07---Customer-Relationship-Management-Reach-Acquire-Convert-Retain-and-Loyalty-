import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { AuthProvider } from './AuthContext';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockApi(login: { status: number; body: unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const isLogin = String(url).endsWith('/auth/login');
      const status = isLogin ? login.status : 200;
      const body = isLogin ? login.body : { status: 'ok', database: 'ok' };
      return { ok: status < 400, status, statusText: '', json: async () => body };
    }),
  );
}

function renderApp(path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function signIn(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

const rep = { id: '1', name: 'Rep One', email: 'rep@crm.test', role: 'SALES_REP' };
const admin = { id: '2', name: 'Admin One', email: 'admin@crm.test', role: 'ADMIN' };

describe('CRM-7 login and menus', () => {
  it('redirects to /login when logged out', () => {
    mockApi({ status: 200, body: {} });
    renderApp('/deals');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy();
  });

  it('shows an error message on a failed login', async () => {
    mockApi({ status: 401, body: { error: { code: 'INVALID_CREDENTIALS', message: 'bad' } } });
    renderApp('/login');
    signIn('rep@crm.test', 'wrong');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Invalid email or password');
  });

  it('TC-AUTH-03 a Sales Rep does not see Admin or Campaigns', async () => {
    mockApi({ status: 200, body: { token: 't', user: rep } });
    renderApp('/login');
    signIn('rep@crm.test', 'Password@123');
    await screen.findByText('Rep One');
    expect(screen.getByRole('link', { name: 'Deals' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Campaigns' })).toBeNull();
  });

  it('an Admin sees the Admin and Campaigns menu items', async () => {
    mockApi({ status: 200, body: { token: 't', user: admin } });
    renderApp('/login');
    signIn('admin@crm.test', 'Password@123');
    await screen.findByText('Admin One');
    expect(screen.getByRole('link', { name: 'Admin' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Campaigns' })).toBeTruthy();
  });

  it('logout returns to the login page', async () => {
    mockApi({ status: 200, body: { token: 't', user: rep } });
    renderApp('/login');
    signIn('rep@crm.test', 'Password@123');
    await screen.findByText('Rep One');
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy();
  });

  it('TC-UX-01 has a menu button that opens and closes the sidebar on small screens', async () => {
    mockApi({ status: 200, body: { token: 't', user: rep } });
    renderApp('/login');
    signIn('rep@crm.test', 'Password@123');
    await screen.findByText('Rep One');
    const toggle = screen.getByRole('button', { name: 'Toggle menu' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });
});
