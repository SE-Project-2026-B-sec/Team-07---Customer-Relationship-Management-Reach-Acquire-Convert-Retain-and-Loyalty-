import type { Role, User } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/common/prisma';
import { resolveAudience } from '../src/modules/reach';
import { audienceWhere, describeFilter, readFilter } from '../src/modules/reach/segments.audience';
import { authHeader } from './helpers';

const DOMAIN = '@segments-test.invalid';
// A city name no seed contact uses, so counts below are exact.
const CITY = 'Segmentville';
const app = createApp();

let admin: User;
let marketing: User;
let rep: User;
const created: string[] = [];

const makeUser = (role: Role, tag: string) =>
  prisma.user.create({
    data: { email: `${tag}${DOMAIN}`, passwordHash: 'x', name: `Segments ${tag}`, role },
  });

let n = 0;
async function makeContact(data: {
  consent: boolean;
  city?: string;
  tier?: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  tags?: string[];
  orderDaysAgo?: number;
}) {
  n += 1;
  const contact = await prisma.contact.create({
    data: {
      name: `Seg Contact ${n}`,
      email: `c${n}${DOMAIN}`,
      referralCode: `SEGTEST${n}`,
      marketingConsent: data.consent,
      city: data.city ?? CITY,
      tier: data.tier ?? 'BRONZE',
      tags: data.tags ?? [],
    },
  });
  if (data.orderDaysAgo !== undefined) {
    await prisma.order.create({
      data: {
        orderNo: `SEGTEST-${n}`,
        amount: 1000,
        contactId: contact.id,
        orderedAt: new Date(Date.now() - data.orderDaysAgo * 86_400_000),
      },
    });
  }
  return contact;
}

async function cleanup() {
  await prisma.campaign.deleteMany({ where: { segment: { name: { startsWith: 'SegTest' } } } });
  await prisma.segment.deleteMany({ where: { name: { startsWith: 'SegTest' } } });
  await prisma.order.deleteMany({ where: { orderNo: { startsWith: 'SEGTEST-' } } });
  await prisma.contact.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
}

beforeAll(async () => {
  await cleanup();
  admin = await makeUser('ADMIN', 'admin');
  marketing = await makeUser('MARKETING', 'marketing');
  rep = await makeUser('SALES_REP', 'rep');

  // TC-REACH-03 data: 10 contacts in CITY, 3 of them without marketing consent.
  for (let i = 0; i < 7; i++) created.push((await makeContact({ consent: true })).id);
  for (let i = 0; i < 3; i++) await makeContact({ consent: false });

  // Extra contacts for the other rules (all in a second test city).
  await makeContact({
    consent: true,
    city: 'Filtertown',
    tier: 'GOLD',
    tags: ['vip'],
    orderDaysAgo: 10,
  });
  await makeContact({ consent: true, city: 'Filtertown', tier: 'SILVER', orderDaysAgo: 200 });
  await makeContact({ consent: true, city: 'Filtertown', tier: 'GOLD' }); // never ordered
  await makeContact({
    consent: false,
    city: 'Filtertown',
    tier: 'GOLD',
    tags: ['vip'],
    orderDaysAgo: 5,
  });
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const preview = (filter: object, user: User = marketing) =>
  request(app).post('/api/v1/segments/preview').set(authHeader(user)).send({ filter });

describe('TC-REACH-03 audience rules', () => {
  it('a segment of 10 contacts where 3 have no consent has an audience of 7', async () => {
    const res = await preview({ cities: [CITY] });
    expect(res.status).toBe(200);
    expect(res.body.audienceSize).toBe(7);
    expect(res.body.sample).toHaveLength(7);
  });

  it('TC-SEC-07 never includes a contact without marketing consent, whatever the filter', async () => {
    const res = await preview({ cities: ['Filtertown'], tags: ['vip'] });
    expect(res.body.audienceSize).toBe(1); // the non-consenting GOLD vip is left out
  });

  it('matches cities without caring about capitals', async () => {
    expect((await preview({ cities: [CITY.toUpperCase()] })).body.audienceSize).toBe(7);
  });

  it('filters by tier, tags and order history', async () => {
    const town = { cities: ['Filtertown'] };
    expect((await preview({ ...town, tiers: ['GOLD'] })).body.audienceSize).toBe(2);
    expect((await preview({ ...town, tags: ['vip'] })).body.audienceSize).toBe(1);
    expect((await preview({ ...town, orderedWithinDays: 30 })).body.audienceSize).toBe(1);
    expect((await preview({ ...town, noOrderForDays: 90 })).body.audienceSize).toBe(2);
  });

  it('rejects unknown rules and contradictory order rules with 400', async () => {
    expect((await preview({ colour: 'red' })).status).toBe(400);
    expect((await preview({ orderedWithinDays: 30, noOrderForDays: 30 })).status).toBe(400);
  });
});

describe('segments API', () => {
  let segmentId = '';

  it('creates a segment and returns its audience size and summary', async () => {
    const res = await request(app)
      .post('/api/v1/segments')
      .set(authHeader(marketing))
      .send({ name: 'SegTest Segmentville', filter: { cities: [CITY, ` ${CITY} `] } });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'SegTest Segmentville',
      filter: { cities: [CITY] },
      summary: `City: ${CITY}`,
      audienceSize: 7,
      campaignCount: 0,
    });
    segmentId = res.body.id;
  });

  it('lists segments in the shape the campaign form expects', async () => {
    const res = await request(app).get('/api/v1/segments?pageSize=100').set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 100 });
    expect(res.body.data.find((s: { id: string }) => s.id === segmentId)).toMatchObject({
      id: segmentId,
      name: 'SegTest Segmentville',
    });
  });

  it('can be used by a campaign (CRM-18)', async () => {
    const res = await request(app).post('/api/v1/campaigns').set(authHeader(marketing)).send({
      name: 'SegTest campaign',
      channel: 'EMAIL',
      budget: 5000,
      startDate: '2026-11-10',
      endDate: '2026-11-20',
      segmentId,
    });
    expect(res.status).toBe(201);
    expect(res.body.segmentName).toBe('SegTest Segmentville');

    const seg = await request(app).get(`/api/v1/segments/${segmentId}`).set(authHeader(marketing));
    expect(seg.body.campaignCount).toBe(1);
  });

  it('lists the audience contacts, page by page', async () => {
    const res = await request(app)
      .get(`/api/v1/segments/${segmentId}/audience?pageSize=5`)
      .set(authHeader(marketing));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(7);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.data[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        email: expect.any(String),
      }),
    );
  });

  it('resolveAudience() returns exactly the consenting contacts (used by CRM-19 sends)', async () => {
    const ids = await resolveAudience(segmentId);
    expect(ids.sort()).toEqual([...created].sort());
  });

  it('renames a segment and changes its rules', async () => {
    const res = await request(app)
      .patch(`/api/v1/segments/${segmentId}`)
      .set(authHeader(marketing))
      .send({ name: 'SegTest Gold', filter: { cities: ['Filtertown'], tiers: ['GOLD'] } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'SegTest Gold', audienceSize: 2 });
  });

  it('rejects an empty update and a missing name', async () => {
    const empty = await request(app)
      .patch(`/api/v1/segments/${segmentId}`)
      .set(authHeader(marketing))
      .send({});
    const noName = await request(app)
      .post('/api/v1/segments')
      .set(authHeader(marketing))
      .send({ filter: {} });
    expect(empty.status).toBe(400);
    expect(noName.status).toBe(400);
  });

  it('returns 404 for an unknown segment', async () => {
    const res = await request(app)
      .get('/api/v1/segments/00000000-0000-0000-0000-000000000000')
      .set(authHeader(marketing));
    expect(res.status).toBe(404);
    await expect(resolveAudience('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      'Segment not found',
    );
  });

  it('is limited to Admin and Marketing (401 without login, 403 for a Sales Rep)', async () => {
    expect((await request(app).get('/api/v1/segments')).status).toBe(401);
    expect((await request(app).get('/api/v1/segments').set(authHeader(rep))).status).toBe(403);
    expect((await preview({}, rep)).status).toBe(403);
  });
});

describe('filter helpers', () => {
  it('reads old seed-style filters like { city: "Bengaluru" }', () => {
    expect(readFilter({ city: 'Bengaluru' })).toEqual({ cities: ['Bengaluru'] });
    expect(readFilter(null)).toEqual({});
    expect(readFilter({ nonsense: true })).toEqual({});
  });

  it('describes a filter in plain words', () => {
    expect(describeFilter({})).toBe('All consenting contacts');
    expect(
      describeFilter({
        cities: ['Pune'],
        tiers: ['GOLD', 'PLATINUM'],
        tags: ['vip'],
        noOrderForDays: 90,
      }),
    ).toBe('City: Pune · Tier: Gold, Platinum · Tags: vip · No order for 90 days');
    expect(describeFilter({ orderedWithinDays: 30 })).toBe('Ordered in last 30 days');
  });

  it('always requires marketing consent', () => {
    expect(audienceWhere({})).toEqual({ AND: [{ marketingConsent: true }] });
  });
});
