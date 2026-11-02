import { randomUUID } from 'node:crypto';
import type { Prisma, Role, User } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/common/prisma';
import { authHeader } from './helpers';

const DOMAIN = '@c360-test.invalid';
const PREFIX = 'C360 ';
const app = createApp();

let admin: User;
let support: User;
let manager: User;
let rep: User;
let marketing: User;
let seq = 0;

const makeUser = (role: Role, tag: string) =>
  prisma.user.create({
    data: {
      email: `${tag}${DOMAIN}`,
      passwordHash: 'not-a-real-hash',
      name: `${PREFIX}${tag}`,
      role,
    },
  });

const clean = async () => {
  const contacts = await prisma.contact.findMany({
    where: { email: { endsWith: DOMAIN } },
    select: { id: true },
  });
  const ids = contacts.map((c) => c.id);
  await prisma.pointsLedger.deleteMany({ where: { contactId: { in: ids } } });
  await prisma.order.deleteMany({ where: { contactId: { in: ids } } });
  await prisma.ticket.deleteMany({ where: { contactId: { in: ids } } });
  await prisma.activity.deleteMany({
    where: { OR: [{ contactId: { in: ids } }, { user: { email: { endsWith: DOMAIN } } }] },
  });
  await prisma.deal.deleteMany({ where: { contactId: { in: ids } } });
  await prisma.lead.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await prisma.contact.deleteMany({ where: { id: { in: ids } } });
  await prisma.campaign.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.account.deleteMany({ where: { name: { startsWith: PREFIX } } });
};

beforeAll(async () => {
  await clean();
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  admin = await makeUser('ADMIN', 'admin');
  support = await makeUser('SUPPORT', 'support');
  manager = await makeUser('SALES_MANAGER', 'manager');
  rep = await makeUser('SALES_REP', 'rep');
  marketing = await makeUser('MARKETING', 'marketing');
});

afterAll(async () => {
  await clean();
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await prisma.$disconnect();
});

const makeContact = (extra: Partial<Prisma.ContactUncheckedCreateInput> = {}) => {
  seq += 1;
  return prisma.contact.create({
    data: {
      name: `${PREFIX}Customer ${seq}`,
      email: `customer${seq}${DOMAIN}`,
      referralCode: `C360REF${seq}`,
      ...extra,
    },
  });
};

const at = (iso: string) => new Date(iso);
const get = (user: User, id: string, query = '') =>
  request(app).get(`/api/v1/customers/${id}/360${query}`).set(authHeader(user));
type Item = { kind: string; title: string; at: string; amount: number | null };
const kindsOf = (body: { timeline: Item[] }) => body.timeline.map((i) => i.kind);

/** A customer with one of everything, each on a known date. */
async function customerWithHistory() {
  const account = await prisma.account.create({
    data: { name: `${PREFIX}Sharma Traders`, industry: 'Retail', city: 'Pune' },
  });
  const contact = await makeContact({
    accountId: account.id,
    ownerId: manager.id,
    city: 'Pune',
    tier: 'SILVER',
  });
  const deal = await prisma.deal.create({
    data: {
      title: 'Annual plan',
      value: 120000,
      contactId: contact.id,
      ownerId: manager.id,
      createdAt: at('2026-09-01T10:00:00Z'),
    },
  });
  const order = await prisma.order.create({
    data: {
      orderNo: `C360-ORD-${contact.referralCode}`,
      amount: 4500,
      contactId: contact.id,
      dealId: deal.id,
      orderedAt: at('2026-09-05T10:00:00Z'),
    },
  });
  await prisma.ticket.create({
    data: {
      subject: 'Order not delivered',
      description: 'Parcel is late',
      priority: 'HIGH',
      slaDueAt: at('2026-09-11T10:00:00Z'),
      contactId: contact.id,
      createdAt: at('2026-09-10T10:00:00Z'),
    },
  });
  await prisma.pointsLedger.create({
    data: {
      contactId: contact.id,
      delta: 45,
      reason: 'EARN',
      balanceAfter: 45,
      orderId: order.id,
      createdAt: at('2026-09-11T10:00:00Z'),
    },
  });
  await prisma.activity.create({
    data: {
      type: 'CALL',
      subject: 'Follow-up call',
      userId: manager.id,
      contactId: contact.id,
      createdAt: at('2026-09-20T10:00:00Z'),
    },
  });
  const campaign = await prisma.campaign.create({
    data: {
      name: `${PREFIX}Diwali push`,
      channel: 'EMAIL',
      budget: 1000,
      startDate: at('2026-09-25T00:00:00Z'),
      endDate: at('2026-10-25T00:00:00Z'),
    },
  });
  await prisma.campaignEvent.create({
    data: {
      campaignId: campaign.id,
      contactId: contact.id,
      type: 'OPEN',
      occurredAt: at('2026-10-01T10:00:00Z'),
    },
  });
  return { contact, deal, order };
}

describe('GET /api/v1/customers/:id/360 (CRM-22)', () => {
  it('returns 401 without a token', async () => {
    const contact = await makeContact();
    const res = await request(app).get(`/api/v1/customers/${contact.id}/360`);
    expect(res.status).toBe(401);
  });

  it('allows Admin, Support and Sales Manager and refuses a Sales Rep and Marketing', async () => {
    const contact = await makeContact();
    for (const user of [admin, support, manager]) {
      expect((await get(user, contact.id)).status).toBe(200);
    }
    for (const user of [rep, marketing]) {
      expect((await get(user, contact.id)).status).toBe(403);
    }
  });

  it('TC-RET-02 shows a deal, order, ticket and points on one timeline, newest first', async () => {
    const { contact } = await customerWithHistory();
    const res = await get(support, contact.id);

    expect(res.status).toBe(200);
    expect(kindsOf(res.body)).toEqual([
      'CAMPAIGN',
      'ACTIVITY',
      'POINTS',
      'TICKET',
      'ORDER',
      'DEAL',
    ]);
    const times = res.body.timeline.map((i: Item) => new Date(i.at).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);

    const byKind = (kind: string) => res.body.timeline.find((i: Item) => i.kind === kind) as Item;
    expect(byKind('DEAL').title).toBe('Deal created: Annual plan');
    expect(byKind('DEAL').amount).toBe(120000);
    expect(byKind('ORDER').amount).toBe(4500);
    expect(byKind('TICKET').title).toBe('Ticket opened: Order not delivered');
    expect(byKind('POINTS').title).toBe('Points earned: +45 points');
    expect(byKind('ACTIVITY').title).toBe('Call: Follow-up call');
    expect(byKind('CAMPAIGN').title).toBe(`Campaign opened: ${PREFIX}Diwali push`);
  });

  it('returns the profile, account, owner, points balance and summary counts', async () => {
    const { contact } = await customerWithHistory();
    const res = await get(admin, contact.id);

    expect(res.body.profile).toMatchObject({
      id: contact.id,
      name: contact.name,
      email: contact.email,
      city: 'Pune',
      tier: 'SILVER',
      ownerName: `${PREFIX}manager`,
      pointsBalance: 45,
      account: { name: `${PREFIX}Sharma Traders`, industry: 'Retail' },
    });
    expect(res.body.summary).toEqual({
      deals: 1,
      orders: 1,
      tickets: 1,
      openTickets: 1,
      activities: 1,
      campaignTouches: 1,
      totalSpent: 4500,
    });
    expect(res.body.truncated).toBe(false);
  });

  it('adds separate items for a won deal and a resolved ticket', async () => {
    const contact = await makeContact();
    await prisma.deal.create({
      data: {
        title: 'Pilot',
        value: 50000,
        stage: 'WON',
        wonAt: at('2026-09-15T10:00:00Z'),
        contactId: contact.id,
        ownerId: manager.id,
        createdAt: at('2026-09-01T10:00:00Z'),
      },
    });
    await prisma.ticket.create({
      data: {
        subject: 'Login problem',
        description: 'Cannot sign in',
        status: 'RESOLVED',
        slaDueAt: at('2026-09-14T10:00:00Z'),
        resolvedAt: at('2026-09-12T10:00:00Z'),
        contactId: contact.id,
        createdAt: at('2026-09-10T10:00:00Z'),
      },
    });
    const res = await get(support, contact.id);
    expect(res.body.timeline.map((i: Item) => i.title)).toEqual([
      'Deal won: Pilot',
      'Ticket resolved: Login problem',
      'Ticket opened: Login problem',
      'Deal created: Pilot',
    ]);
    expect(res.body.summary.openTickets).toBe(0);
  });

  it('includes activities on the customer, on their deals and on the lead they came from', async () => {
    const contact = await makeContact();
    const other = await makeContact();
    const deal = await prisma.deal.create({
      data: { title: 'Renewal', value: 1000, contactId: contact.id, ownerId: manager.id },
    });
    const lead = await prisma.lead.create({
      data: {
        name: `${PREFIX}Lead`,
        email: `lead${DOMAIN}`,
        convertedContactId: contact.id,
        status: 'CONVERTED',
      },
    });
    const log = (subject: string, link: { contactId?: string; dealId?: string; leadId?: string }) =>
      prisma.activity.create({ data: { ...link, type: 'NOTE', subject, userId: manager.id } });
    await log('On the contact', { contactId: contact.id });
    await log('On the deal', { dealId: deal.id });
    await log('On the lead', { leadId: lead.id });
    await log('Someone else', { contactId: other.id });

    const res = await get(manager, contact.id);
    const subjects = res.body.timeline
      .filter((i: Item) => i.kind === 'ACTIVITY')
      .map((i: Item) => i.title)
      .sort();
    expect(subjects).toEqual(['Note: On the contact', 'Note: On the deal', 'Note: On the lead']);
    expect(res.body.summary.activities).toBe(3);
  });

  it('uses the latest ledger row as the points balance', async () => {
    const contact = await makeContact();
    const row = (
      delta: number,
      balanceAfter: number,
      createdAt: string,
      reason: 'EARN' | 'REDEEM',
    ) =>
      prisma.pointsLedger.create({
        data: { contactId: contact.id, delta, balanceAfter, reason, createdAt: at(createdAt) },
      });
    await row(100, 100, '2026-09-01T10:00:00Z', 'EARN');
    await row(-30, 70, '2026-09-02T10:00:00Z', 'REDEEM');

    const res = await get(support, contact.id);
    expect(res.body.profile.pointsBalance).toBe(70);
    expect(res.body.timeline.map((i: Item) => i.title)).toEqual([
      'Points redeemed: -30 points',
      'Points earned: +100 points',
    ]);
  });

  it('returns an empty timeline and a zero balance for a customer with no history', async () => {
    const contact = await makeContact();
    const res = await get(support, contact.id);
    expect(res.status).toBe(200);
    expect(res.body.timeline).toEqual([]);
    expect(res.body.profile.pointsBalance).toBe(0);
    expect(res.body.summary.totalSpent).toBe(0);
    expect(res.body.profile.account).toBeNull();
  });

  it('limits the timeline and says when it was cut', async () => {
    const contact = await makeContact();
    for (let i = 1; i <= 5; i++) {
      await prisma.order.create({
        data: {
          orderNo: `C360-LIM-${contact.referralCode}-${i}`,
          amount: i * 100,
          contactId: contact.id,
          orderedAt: at(`2026-09-0${i}T10:00:00Z`),
        },
      });
    }
    const res = await get(support, contact.id, '?limit=3');
    expect(res.body.timeline).toHaveLength(3);
    expect(res.body.truncated).toBe(true);
    expect(res.body.summary.orders).toBe(5);
    expect(res.body.timeline[0].amount).toBe(500);

    expect((await get(support, contact.id, '?limit=0')).status).toBe(400);
    expect((await get(support, contact.id, '?limit=501')).status).toBe(400);
  });

  it('returns 404 for an unknown customer and 400 for a bad id', async () => {
    const unknown = await get(support, randomUUID());
    const bad = await get(support, 'not-an-id');
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('NOT_FOUND');
    expect(bad.status).toBe(400);
  });
});
