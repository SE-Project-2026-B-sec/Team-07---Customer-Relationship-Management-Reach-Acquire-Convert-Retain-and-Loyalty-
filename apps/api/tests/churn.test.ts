// CRM-23 integration tests: the SQL recompute matches the rule (TC-RET-03), tickets keep the
// flag up to date, and GET /churn-risk lists at-risk customers with reasons.
import type { Contact, Role, User } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/common/prisma';
import { churnService } from '../src/modules/retain/churn.service';
import { authHeader } from './helpers';

const app = createApp();
const DOMAIN = '@churn-test.invalid';
const TAG = `CH${Date.now()}`;
const DAY = 86_400_000;
const users: Partial<Record<Role, User>> = {};

let lapsed: Contact; // last order 91 days ago
let recent: Contact; // last order 89 days ago
let neverOrdered: Contact;
let unhappy: Contact; // gets High/Urgent tickets during the test

const makeContact = (name: string) =>
  prisma.contact.create({
    data: {
      name: `${TAG} ${name}`,
      email: `${name.toLowerCase().replace(/\s/g, '')}-${TAG}${DOMAIN}`.toLowerCase(),
      referralCode: `${TAG}${name.replace(/\s/g, '')}`,
    },
  });

const order = (contactId: string, daysAgo: number, n: number) =>
  prisma.order.create({
    data: {
      orderNo: `${TAG}-${n}`,
      amount: 500,
      contactId,
      orderedAt: new Date(Date.now() - daysAgo * DAY),
    },
  });

const flag = async (c: Contact) =>
  (await prisma.contact.findUniqueOrThrow({ where: { id: c.id } })).isChurnRisk;

const ticket = (priority: string) =>
  request(app)
    .post('/api/v1/tickets')
    .set(authHeader(users.SUPPORT!))
    .send({ subject: `${TAG} problem`, description: 'x', priority, contactId: unhappy.id });

beforeAll(async () => {
  for (const role of ['ADMIN', 'SUPPORT', 'SALES_MANAGER', 'MARKETING', 'SALES_REP'] as Role[]) {
    users[role] = await prisma.user.create({
      data: {
        email: `${role.toLowerCase()}-${TAG}${DOMAIN}`,
        passwordHash: 'x',
        name: `Churn ${role}`,
        role,
      },
    });
  }
  lapsed = await makeContact('Lapsed');
  recent = await makeContact('Recent');
  neverOrdered = await makeContact('Never ordered');
  unhappy = await makeContact('Unhappy');
  await order(lapsed.id, 200, 1);
  await order(lapsed.id, 91, 2);
  await order(recent.id, 89, 3);
});

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { subject: { startsWith: TAG } } });
  await prisma.order.deleteMany({ where: { orderNo: { startsWith: TAG } } });
  await prisma.contact.deleteMany({
    where: { email: { endsWith: `${TAG}${DOMAIN}`.toLowerCase() } },
  });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await prisma.$disconnect();
});

describe('Churn-risk flag (CRM-23)', () => {
  it('TC-RET-03 last order 91 days ago sets the flag; 89 days ago does not', async () => {
    for (const c of [lapsed, recent, neverOrdered]) await churnService.recompute(c.id);

    expect(await flag(lapsed)).toBe(true);
    expect(await flag(recent)).toBe(false);
    expect(await flag(neverOrdered)).toBe(false);
  });

  it('recomputing everyone gives the same answers and only writes changed rows', async () => {
    await churnService.recompute();
    expect(await flag(lapsed)).toBe(true);
    expect(await flag(recent)).toBe(false);
    expect(await churnService.recompute(lapsed.id)).toBe(0); // already correct
  });

  it('a new order clears the flag on the next recompute', async () => {
    await order(lapsed.id, 0, 4);
    await churnService.recompute(lapsed.id);
    expect(await flag(lapsed)).toBe(false);
    await prisma.order.delete({ where: { orderNo: `${TAG}-4` } });
    await churnService.recompute(lapsed.id);
    expect(await flag(lapsed)).toBe(true);
  });

  it('the second open High/Urgent ticket flags the customer straight away', async () => {
    const low = await ticket('LOW');
    expect(low.body.contactChurnRisk).toBe(false);
    const high = await ticket('HIGH');
    expect(high.body.contactChurnRisk).toBe(false);

    const urgent = await ticket('URGENT');
    expect(urgent.status).toBe(201);
    expect(urgent.body.contactChurnRisk).toBe(true);
    expect(await flag(unhappy)).toBe(true);
  });

  it('resolving one of those tickets clears the flag', async () => {
    const open = await prisma.ticket.findFirstOrThrow({
      where: { contactId: unhappy.id, priority: 'URGENT' },
    });
    const res = await request(app)
      .patch(`/api/v1/tickets/${open.id}`)
      .set(authHeader(users.SUPPORT!))
      .send({ status: 'RESOLVED' });

    expect(res.body.contactChurnRisk).toBe(false);
    expect(await flag(unhappy)).toBe(false);
  });

  it('GET /churn-risk lists at-risk customers with their reasons', async () => {
    const res = await request(app)
      .get('/api/v1/churn-risk')
      .query({ q: TAG })
      .set(authHeader(users.SUPPORT!));

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0]).toMatchObject({
      id: lapsed.id,
      openHighTickets: 0,
      reasons: ['NO_RECENT_ORDER'],
    });
    expect(Date.now() - Date.parse(res.body.data[0].lastOrderAt)).toBeGreaterThan(90 * DAY);
  });

  it('lets Marketing and Sales Manager read the list; refuses Sales Rep', async () => {
    for (const role of ['MARKETING', 'SALES_MANAGER'] as Role[]) {
      const res = await request(app).get('/api/v1/churn-risk').set(authHeader(users[role]!));
      expect(res.status).toBe(200);
    }
    const rep = await request(app).get('/api/v1/churn-risk').set(authHeader(users.SALES_REP!));
    expect(rep.status).toBe(403);
  });

  it('only Admin can trigger a full recompute', async () => {
    const admin = await request(app)
      .post('/api/v1/churn-risk/recompute')
      .set(authHeader(users.ADMIN!));
    expect(admin.status).toBe(200);
    expect(typeof admin.body.changed).toBe('number');

    const support = await request(app)
      .post('/api/v1/churn-risk/recompute')
      .set(authHeader(users.SUPPORT!));
    expect(support.status).toBe(403);
  });
});
