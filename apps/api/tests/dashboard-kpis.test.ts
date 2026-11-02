import type { Prisma, Role, User } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/common/prisma';
import { authHeader } from './helpers';

// KPI tests build their own data in March 2031, so the expected numbers never depend on the seed.
const DOMAIN = '@kpi-test.invalid';
const WINDOW = '?from=2031-03-01&to=2031-03-31';
const app = createApp();

let admin: User;
let manager: User;
let rep: User;
let support: User;
let marketing: User;
let seq = 0;

const at = (iso: string) => new Date(iso);

const makeUser = (role: Role, tag: string) =>
    prisma.user.create({
        data: { email: `${tag}${DOMAIN}`, passwordHash: 'not-a-real-hash', name: `KPI ${tag}`, role },
    });

const makeContact = (extra: Partial<Prisma.ContactUncheckedCreateInput> = {}) => {
    seq += 1;
    return prisma.contact.create({
        data: {
            name: `KPI Customer ${seq}`,
            email: `customer${seq}${DOMAIN}`,
            referralCode: `KPIREF${seq}`,
            ...extra,
        },
    });
};

const makeOrder = (contactId: string, amount: number, orderedAt: string) => {
    seq += 1;
    return prisma.order.create({
        data: { orderNo: `KPI-ORD-${seq}`, amount, contactId, orderedAt: at(orderedAt) },
    });
};

const makeLead = (status: 'NEW' | 'CONTACTED' | 'CONVERTED', createdAt: string) => {
    seq += 1;
    return prisma.lead.create({
        data: { name: `KPI Lead ${seq}`, email: `lead${seq}${DOMAIN}`, status, createdAt: at(createdAt) },
    });
};

const clean = async () => {
    const contacts = await prisma.contact.findMany({
        where: { email: { endsWith: DOMAIN } },
        select: { id: true },
    });
    const ids = contacts.map((c) => c.id);
    await prisma.pointsLedger.deleteMany({ where: { contactId: { in: ids } } });
    await prisma.order.deleteMany({ where: { contactId: { in: ids } } });
    await prisma.deal.deleteMany({ where: { contactId: { in: ids } } });
    await prisma.lead.deleteMany({ where: { email: { endsWith: DOMAIN } } });
    await prisma.contact.deleteMany({ where: { id: { in: ids } } });
};

const kpis = (user: User, query = WINDOW) =>
    request(app).get(`/api/v1/dashboard/kpis${query}`).set(authHeader(user));

beforeAll(async () => {
    await clean();
    await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
    admin = await makeUser('ADMIN', 'admin');
    manager = await makeUser('SALES_MANAGER', 'manager');
    rep = await makeUser('SALES_REP', 'rep');
    support = await makeUser('SUPPORT', 'support');
    marketing = await makeUser('MARKETING', 'marketing');

    // Leads: 5 inside the window (2 converted), 1 converted lead outside it.
    await makeLead('NEW', '2031-03-02T10:00:00Z');
    await makeLead('NEW', '2031-03-05T10:00:00Z');
    await makeLead('CONTACTED', '2031-03-10T10:00:00Z');
    await makeLead('CONVERTED', '2031-03-15T10:00:00Z');
    await makeLead('CONVERTED', '2031-03-31T20:00:00Z');
    await makeLead('CONVERTED', '2031-04-02T10:00:00Z');

    // Customers: A has 2 lifetime orders, B 1, C 2 (both in the window).
    // D only orders after the window and E only before it, so neither is active.
    const a = await makeContact();
    const b = await makeContact();
    const c = await makeContact();
    const d = await makeContact();
    const e = await makeContact();
    await makeOrder(a.id, 500, '2031-02-01T10:00:00Z');
    await makeOrder(a.id, 1000, '2031-03-05T10:00:00Z');
    await makeOrder(b.id, 2000, '2031-03-12T10:00:00Z');
    await makeOrder(c.id, 300, '2031-03-20T10:00:00Z');
    await makeOrder(c.id, 700, '2031-03-25T10:00:00Z');
    await makeOrder(d.id, 9999, '2031-04-10T10:00:00Z');
    await makeOrder(e.id, 8888, '2031-02-10T10:00:00Z');

    // Points entries: A and B inside the window, C just outside it.
    const ledger = (contactId: string, createdAt: string) =>
        prisma.pointsLedger.create({
            data: { contactId, delta: 10, reason: 'EARN', balanceAfter: 10, createdAt: at(createdAt) },
        });
    await ledger(a.id, '2031-03-06T10:00:00Z');
    await ledger(b.id, '2031-03-20T10:00:00Z');
    await ledger(c.id, '2031-04-02T10:00:00Z');

    // Deals: two won in the window, two open and created in the window; the rest are decoys.
    const deal = (
        value: number,
        stage: 'PROSPECTING' | 'NEGOTIATION' | 'WON' | 'LOST',
        createdAt: string,
        wonAt?: string,
    ) =>
        prisma.deal.create({
            data: {
                title: `KPI deal ${value}`,
                value,
                stage,
                contactId: a.id,
                ownerId: manager.id,
                createdAt: at(createdAt),
                ...(wonAt ? { wonAt: at(wonAt) } : {}),
            },
        });
    await deal(100000, 'WON', '2031-03-03T10:00:00Z', '2031-03-10T10:00:00Z');
    await deal(50000, 'WON', '2031-03-04T10:00:00Z', '2031-03-31T20:00:00Z');
    await deal(7000, 'WON', '2031-01-10T10:00:00Z', '2031-02-10T10:00:00Z');
    await deal(70000, 'PROSPECTING', '2031-03-08T10:00:00Z');
    await deal(30000, 'NEGOTIATION', '2031-03-20T10:00:00Z');
    await deal(5000, 'PROSPECTING', '2031-04-10T10:00:00Z');
    await deal(9000, 'LOST', '2031-03-09T10:00:00Z');
});

afterAll(async () => {
    await clean();
    await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
    await prisma.$disconnect();
});

describe('GET /api/v1/dashboard/kpis (CRM-28)', () => {
    it('returns 401 without a token', async () => {
        const res = await request(app).get(`/api/v1/dashboard/kpis${WINDOW}`);
        expect(res.status).toBe(401);
    });

    it('is open to every logged-in role', async () => {
        for (const user of [admin, manager, rep, support, marketing]) {
            expect((await kpis(user)).status).toBe(200);
        }
    });

    it('TC-ANA-01 counts new leads and the conversion rate for the chosen range', async () => {
        const res = await kpis(admin);
        expect(res.body.range.from).toBe('2031-03-01T00:00:00.000Z');
        expect(res.body.range.to).toBe('2031-03-31T23:59:59.999Z');
        expect(res.body.newLeads).toBe(5);
        expect(res.body.convertedLeads).toBe(2);
        expect(res.body.conversionRate).toBe(40);
    });

    it('TC-ANA-01 adds up won revenue and the open pipeline for the chosen range', async () => {
        const res = await kpis(admin);
        expect(res.body.wonRevenue).toBe(150000);
        expect(res.body.wonDeals).toBe(2);
        expect(res.body.openPipelineValue).toBe(100000);
        expect(res.body.openDeals).toBe(2);
    });

    it('TC-ANA-01 works out customer value, retention and loyalty members', async () => {
        const res = await kpis(admin);
        expect(res.body.activeCustomers).toBe(3);
        // Lifetime totals: A 500 + 1000 = 1500, B 2000, C 300 + 700 = 1000 -> 4500 / 3.
        expect(res.body.averageCustomerValue).toBe(1500);
        // A and C ordered more than once: 2 of 3.
        expect(res.body.retentionRate).toBe(66.7);
        expect(res.body.activeLoyaltyMembers).toBe(2);
    });

    it('changes with the range', async () => {
        const early = await kpis(admin, '?from=2031-03-01&to=2031-03-10');
        expect(early.body.newLeads).toBe(3);
        expect(early.body.wonRevenue).toBe(100000);
        expect(early.body.openPipelineValue).toBe(70000);
        expect(early.body.activeCustomers).toBe(1);
    });

    it('shows zeros for a range with no data', async () => {
        const res = await kpis(admin, '?from=2032-01-01&to=2032-01-31');
        expect(res.body).toMatchObject({
            newLeads: 0,
            conversionRate: 0,
            openPipelineValue: 0,
            wonRevenue: 0,
            averageCustomerValue: 0,
            retentionRate: 0,
            activeLoyaltyMembers: 0,
        });
    });

    it('counts customers flagged as churn risk, whatever the range', async () => {
        await makeContact({ isChurnRisk: true });
        await makeContact({ isChurnRisk: true });
        const res = await kpis(admin, '?from=2032-01-01&to=2032-01-31');
        expect(res.body.churnRiskCount).toBeGreaterThanOrEqual(2);
    });

    it('defaults to the last 30 days', async () => {
        const res = await kpis(admin, '');
        expect(res.status).toBe(200);
        const days =
            (new Date(res.body.range.to).getTime() - new Date(res.body.range.from).getTime()) /
            86_400_000;
        expect(Math.round(days)).toBe(30);
    });

    it('rejects a start date after the end date and dates that are not dates', async () => {
        const backwards = await kpis(admin, '?from=2031-03-31&to=2031-03-01');
        const rubbish = await kpis(admin, '?from=yesterday-ish');
        expect(backwards.status).toBe(400);
        expect(backwards.body.error.code).toBe('VALIDATION_ERROR');
        expect(rubbish.status).toBe(400);
    });
});