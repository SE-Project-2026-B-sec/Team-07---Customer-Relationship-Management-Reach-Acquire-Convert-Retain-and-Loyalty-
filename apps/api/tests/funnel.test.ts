// CRM-29 TC-ANA-02: funnel counts and drop-offs match known data.
// All test data is dated March 2001, so other data in the database never falls in the range.
import type { Contact, Role, User } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/common/prisma';
import { buildStages, percent } from '../src/modules/analytics/funnel.service';
import { authHeader } from './helpers';

const app = createApp();
const DOMAIN = '@funnel-test.invalid';
const TAG = `FT${Date.now()}`;
const RANGE = { from: '2001-03-01', to: '2001-03-31' };
const inRange = (day: number) => new Date(Date.UTC(2001, 2, day, 12));
const outOfRange = new Date(Date.UTC(2001, 3, 2, 12)); // 2 April 2001

const users: Partial<Record<Role, User>> = {};
let contacts: Contact[] = [];
let campaignId: string;

const makeUser = (role: Role) =>
  prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${TAG}${DOMAIN}`,
      passwordHash: 'x',
      name: `Funnel ${role}`,
      role,
    },
  });

const makeContact = (i: number) =>
  prisma.contact.create({
    data: {
      name: `${TAG} Contact ${i}`,
      email: `c${i}-${TAG}${DOMAIN}`.toLowerCase(),
      referralCode: `${TAG}${i}`,
    },
  });

const makeLead = (
  i: number,
  status: 'NEW' | 'LOST' | 'QUALIFIED' | 'CONVERTED',
  createdAt: Date,
  convertedContactId?: string,
) =>
  prisma.lead.create({
    data: {
      name: `${TAG} Lead ${i}`,
      email: `l${i}-${TAG}${DOMAIN}`,
      status,
      createdAt,
      convertedContactId,
    },
  });

const makeOrders = (contactId: string, n: number) =>
  prisma.order.createMany({
    data: Array.from({ length: n }, (_, k) => ({
      orderNo: `${TAG}-${contactId.slice(0, 8)}-${k}`,
      amount: 1000,
      contactId,
      orderedAt: inRange(15),
    })),
  });

beforeAll(async () => {
  for (const role of ['ADMIN', 'MARKETING', 'SALES_MANAGER', 'SALES_REP', 'SUPPORT'] as Role[]) {
    users[role] = await makeUser(role);
  }
  contacts = await Promise.all(Array.from({ length: 8 }, (_, i) => makeContact(i)));
  const [a, b, c, d, e, f, convertedA, convertedB] = contacts;

  const campaign = await prisma.campaign.create({
    data: {
      name: `${TAG} Campaign`,
      channel: 'EMAIL',
      budget: 0,
      startDate: inRange(1),
      endDate: inRange(31),
    },
  });
  campaignId = campaign.id;

  // Reached = 6 distinct contacts sent a message in March.
  await prisma.campaignEvent.createMany({
    data: [
      ...[a, b, c, d, e, f].map((x) => ({
        campaignId,
        contactId: x.id,
        type: 'SENT' as const,
        occurredAt: inRange(10),
      })),
      // Ignored: a second send to the same person, an open, and a send in April.
      { campaignId, contactId: a.id, type: 'SENT', occurredAt: inRange(20) },
      { campaignId, contactId: b.id, type: 'OPEN', occurredAt: inRange(11) },
      { campaignId, contactId: convertedA.id, type: 'SENT', occurredAt: outOfRange },
    ],
  });

  // Leads in March: 5. Qualified (incl. converted): 3. Converted: 2. Repeat (2+ orders): 1.
  await makeLead(1, 'NEW', inRange(5));
  await makeLead(2, 'LOST', inRange(6));
  await makeLead(3, 'QUALIFIED', inRange(7));
  await makeLead(4, 'CONVERTED', inRange(8), convertedA.id);
  await makeLead(5, 'CONVERTED', inRange(9), convertedB.id);
  await makeOrders(convertedA.id, 2);
  await makeOrders(convertedB.id, 1);
  // Outside the range: not counted.
  await makeLead(6, 'CONVERTED', outOfRange);
});

afterAll(async () => {
  await prisma.order.deleteMany({ where: { orderNo: { startsWith: TAG } } });
  await prisma.lead.deleteMany({ where: { email: { endsWith: `${TAG}${DOMAIN}` } } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } }); // events cascade
  await prisma.contact.deleteMany({ where: { id: { in: contacts.map((c) => c.id) } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await prisma.$disconnect();
});

const funnel = (role: Role, query: Record<string, string> = RANGE) =>
  request(app).get('/api/v1/reports/funnel').query(query).set(authHeader(users[role]!));

describe('Funnel report (CRM-29)', () => {
  it('TC-ANA-02 counts each stage from known data', async () => {
    const res = await funnel('SALES_MANAGER');

    expect(res.status).toBe(200);
    expect(res.body.from).toBe('2001-03-01');
    expect(res.body.to).toBe('2001-03-31');
    expect(res.body.stages.map((s: { key: string; count: number }) => [s.key, s.count])).toEqual([
      ['REACHED', 6],
      ['LEADS', 5],
      ['QUALIFIED', 3],
      ['CUSTOMERS', 2],
      ['REPEAT', 1],
    ]);
  });

  it('TC-ANA-02 computes conversion and drop-off between stages', async () => {
    const res = await funnel('ADMIN');
    const rates = res.body.stages.map((s: { conversionRate: number; dropOff: number }) => [
      s.conversionRate,
      s.dropOff,
    ]);
    expect(rates).toEqual([
      [null, null],
      [83.3, 16.7],
      [60, 40],
      [66.7, 33.3],
      [50, 50],
    ]);
  });

  it('the To date is inclusive', async () => {
    const res = await funnel('ADMIN', { from: '2001-03-08', to: '2001-03-08' });
    expect(res.body.stages[1].count).toBe(1); // only lead 4, created on 8 March
  });

  it('lets Marketing see the funnel and refuses Sales Rep and Support', async () => {
    expect((await funnel('MARKETING')).status).toBe(200);
    expect((await funnel('SALES_REP')).status).toBe(403);
    expect((await funnel('SUPPORT')).status).toBe(403);
  });

  it('returns 400 for a bad date or From after To', async () => {
    expect((await funnel('ADMIN', { from: '01-03-2001' })).status).toBe(400);
    expect((await funnel('ADMIN', { from: '2001-03-31', to: '2001-03-01' })).status).toBe(400);
  });

  it('works without a date range', async () => {
    const res = await funnel('ADMIN', {});
    expect(res.status).toBe(200);
    expect(res.body.from).toBeNull();
    expect(res.body.stages).toHaveLength(5);
  });
});

describe('Funnel maths (CRM-29)', () => {
  it('returns null instead of dividing by zero', () => {
    expect(percent(5, 0)).toBeNull();
    const stages = buildStages([0, 0, 0, 0, 0]);
    expect(stages.every((s) => s.conversionRate === null && s.dropOff === null)).toBe(true);
  });

  it('rounds to one decimal place', () => {
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(2, 3)).toBe(66.7);
  });
});
