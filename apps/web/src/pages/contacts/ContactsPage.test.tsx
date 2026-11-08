import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../../api/client';
import { ContactsPage } from './ContactsPage';

vi.mock('../../api/client', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../api/client')>();
  return { ...real, api: vi.fn() };
});
const mockApi = vi.mocked(api);

const CONTACT = {
  id: 'c1',
  name: 'Ananya Rao',
  email: 'ananya@example.com',
  phone: '9876501234',
  city: 'Bengaluru',
  tier: 'SILVER',
  account: { id: 'a1', name: 'Acme Retail' },
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ContactsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ContactsPage (CRM-11)', () => {
  beforeEach(() => mockApi.mockReset());

  it('TC-CONV-01 lists contacts with their account', async () => {
    mockApi.mockResolvedValue({ items: [CONTACT], total: 1 });
    renderPage();
    expect(await screen.findByText('Ananya Rao')).toBeTruthy();
    expect(screen.getByText('Acme Retail')).toBeTruthy();
    expect(screen.getByText(/1 contacts/)).toBeTruthy();
  });

  it('TC-CONV-01 adds a contact', async () => {
    mockApi.mockResolvedValue({ items: [], total: 0 });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Add contact' }));
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'New Person' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'new@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save contact' }));

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith(
        '/contacts',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('shows a clear message for a duplicate email', async () => {
    mockApi.mockImplementation((_path: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? Promise.reject(new ApiError(409, 'DUPLICATE_EMAIL', 'duplicate'))
        : Promise.resolve({ items: [], total: 0 }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Add contact' }));
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Dup' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'dup@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save contact' }));
    expect(await screen.findByText('A contact with this email already exists.')).toBeTruthy();
  });
});
