import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, vi } from 'vitest';
import { App } from './App';
import { AuthProvider } from './auth/AuthContext';
import { NAV } from './components/Layout';

const admin = { id: '1', name: 'Admin One', email: 'admin@crm.test', role: 'ADMIN' };

const mockApi = () =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const isLogin = String(input).endsWith('/auth/login');
    const body = isLogin ? { token: 't', user: admin } : { status: 'ok', db: 'ok' };
    return new Response(JSON.stringify(body), { status: 200 });
  });

const renderAt = (path: string) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const signInAsAdmin = async () => {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'admin@crm.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password@123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByText('Admin One');
};

afterEach(() => vi.restoreAllMocks());

describe('App shell', () => {
  it('shows every module in the navigation for an admin', async () => {
    mockApi();
    renderAt('/login');
    await signInAsAdmin();
    for (const item of NAV) {
      expect(screen.getByRole('link', { name: item.label })).toBeInTheDocument();
    }
  });

  it('shows API status on the dashboard', async () => {
    mockApi();
    renderAt('/login');
    await signInAsAdmin();
    expect(await screen.findByText(/database ok/)).toBeInTheDocument();
  });

  it('renders the login page', () => {
    mockApi();
    renderAt('/login');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});
