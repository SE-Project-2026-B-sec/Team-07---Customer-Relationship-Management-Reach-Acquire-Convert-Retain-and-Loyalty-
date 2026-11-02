import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Customer360Page } from './Customer360Page';
import type { Customer360 } from './types';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const fixture = (): Customer360 => ({
    profile: {
        id: 'c1',
        name: 'Priya Sharma',
        email: 'priya@example.test',
        phone: '+91 98765 43210',
        city: 'Pune',
        tags: ['vip', 'retail'],
        marketingConsent: true,
        tier: 'SILVER',
        isChurnRisk: false,
        referralCode: 'REFA1B2C3',
        createdAt: '2026-08-01T10:00:00.000Z',
        account: { id: 'a1', name: 'Sharma Traders', industry: 'Retail', city: 'Pune' },
        ownerName: 'Meera Manager',
        pointsBalance: 45,
    },
    summary: {
        deals: 1,
        orders: 1,
        tickets: 1,
        openTickets: 1,
        activities: 1,
        campaignTouches: 1,
        totalSpent: 4500,
    },
    timeline: [
        { id: 'campaign:1', kind: 'CAMPAIGN', at: '2026-10-01T10:00:00.000Z', title: 'Campaign opened: Diwali push', detail: null, amount: null },
        { id: 'activity:1', kind: 'ACTIVITY', at: '2026-09-20T10:00:00.000Z', title: 'Call: Follow-up call', detail: 'Logged by Meera Manager', amount: null },
        { id: 'points:1', kind: 'POINTS', at: '2026-09-11T10:00:00.000Z', title: 'Points earned: +45 points', detail: 'Balance 45', amount: null },
        { id: 'ticket:1', kind: 'TICKET', at: '2026-09-10T10:00:00.000Z', title: 'Ticket opened: Order not delivered', detail: 'high priority', amount: null },
        { id: 'order:1', kind: 'ORDER', at: '2026-09-05T10:00:00.000Z', title: 'Order ORD-00001', detail: null, amount: 4500 },
        { id: 'deal:1', kind: 'DEAL', at: '2026-09-01T10:00:00.000Z', title: 'Deal created: Annual plan', detail: 'Now in prospecting', amount: 120000 },
    ],
    truncated: false,
});

function mockServer(result: { body: unknown; status?: number }) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = new URL(String(input), 'http://x');
        if (url.pathname.endsWith('/customers/c1/360')) return json(result.body, result.status ?? 200);
        if (url.pathname.endsWith('/activities')) {
            return json({ data: [], page: 1, pageSize: 100, total: 0 });
        }
        return json({}, 404);
    });
}

const renderPage = () =>
    render(
        <QueryClientProvider
            client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
            <MemoryRouter initialEntries={['/customers/c1']}>
                <Routes>
                    <Route path="/customers/:id" element={<Customer360Page />} />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    );

const timelineTitles = () =>
    within(screen.getByRole('list', { name: 'Timeline' }))
        .getAllByRole('listitem')
        .map((li) => li.querySelector('p')?.textContent);

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('Customer 360 page', () => {
    it('TC-RET-02 shows a deal, order, ticket and points on one timeline, newest first', async () => {
        mockServer({ body: fixture() });
        renderPage();

        await screen.findByRole('heading', { name: 'Priya Sharma' });
        expect(timelineTitles()).toEqual([
            'Campaign opened: Diwali push',
            'Call: Follow-up call',
            'Points earned: +45 points',
            'Ticket opened: Order not delivered',
            'Order ORD-00001',
            'Deal created: Annual plan',
        ]);
        const list = within(screen.getByRole('list', { name: 'Timeline' }));
        expect(list.getByText('₹1,20,000')).toBeInTheDocument();
        expect(list.getByText('₹4,500')).toBeInTheDocument();
    });

    it('shows the profile, account, owner, points and summary counts', async () => {
        mockServer({ body: fixture() });
        renderPage();
        await screen.findByRole('heading', { name: 'Priya Sharma' });

        const profile = within(screen.getByRole('region', { name: 'Profile' }));
        expect(profile.getByText('Sharma Traders')).toBeInTheDocument();
        expect(profile.getByText('Meera Manager')).toBeInTheDocument();
        expect(profile.getByText('priya@example.test')).toBeInTheDocument();
        expect(profile.getByText('Silver')).toBeInTheDocument();
        expect(profile.getByText('vip, retail')).toBeInTheDocument();
        expect(profile.queryByText('Churn risk')).not.toBeInTheDocument();

        const summary = screen.getByRole('region', { name: 'Summary' });
        expect(summary).toHaveTextContent('Points balance');
        expect(summary).toHaveTextContent('45');
        expect(summary).toHaveTextContent('Total spent');
        expect(summary).toHaveTextContent('₹4,500');
        expect(summary).toHaveTextContent('1 of 1');
    });

    it('filters the timeline by kind', async () => {
        mockServer({ body: fixture() });
        renderPage();
        await screen.findByRole('heading', { name: 'Priya Sharma' });

        fireEvent.click(screen.getByRole('button', { name: 'Tickets' }));
        expect(timelineTitles()).toEqual(['Ticket opened: Order not delivered']);

        fireEvent.click(screen.getByRole('button', { name: 'All' }));
        expect(timelineTitles()).toHaveLength(6);
    });

    it('flags a churn-risk customer', async () => {
        const data = fixture();
        data.profile.isChurnRisk = true;
        mockServer({ body: data });
        renderPage();
        await screen.findByRole('heading', { name: 'Priya Sharma' });
        expect(screen.getByText('Churn risk')).toBeInTheDocument();
    });

    it('says so when there is no history and when the list was cut short', async () => {
        const data = fixture();
        data.timeline = [];
        data.truncated = true;
        mockServer({ body: data });
        renderPage();
        await screen.findByRole('heading', { name: 'Priya Sharma' });
        expect(screen.getByText('No activity yet for this customer.')).toBeInTheDocument();
        expect(screen.getByText(/Showing the most recent items only/)).toBeInTheDocument();
    });

    it('shows a clear message when access is refused or the customer does not exist', async () => {
        mockServer({
            body: { error: { code: 'FORBIDDEN', message: 'You do not have permission' } },
            status: 403,
        });
        renderPage();
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'You do not have access to Customer 360.',
        );

        cleanup();
        vi.restoreAllMocks();
        mockServer({ body: { error: { code: 'NOT_FOUND', message: 'Customer not found' } }, status: 404 });
        renderPage();
        expect(await screen.findByRole('alert')).toHaveTextContent('Customer not found.');
    });
});