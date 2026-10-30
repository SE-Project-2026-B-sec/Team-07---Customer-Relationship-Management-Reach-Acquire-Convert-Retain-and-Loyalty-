import { randomUUID } from 'node:crypto';
import type { Contact, Role, User } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/common/prisma';
import { authHeader } from './helpers';

const DOMAIN = '@deals-test.invalid';
const app = createApp();

let rep: User;
let otherRep: User;
let manager: User;
let support: User;
let contact: Contact;
let repDealId = '';
let otherDealId = '';

const makeUser = (role: Role, tag: string) =>
  prisma.user.create({
    data: { email: `${tag}${DOMAIN}`, passwordHash: 'not-a-real-hash', name: `Deals ${tag}`, role },
  });

async function cleanup() {
  await prisma.deal.deleteMany({ where: { owner: { email: { endsWith: DOMAIN } } } });
  await prisma.contact.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
}

beforeAll(async () => {
  await cleanup();
  rep = await makeUser('SALES_REP', 'rep');
  otherRep = await makeUser('SALES_REP', 'otherrep');
  manager = await makeUser('SALES_MANAGER', 'manager');
  support = await makeUser('SUPPORT', 'support');
  contact = await prisma.contact.create({
    data: { name: 'Deals Test Contact', email: `contact${DOMAIN}`, referralCode: 'DEALS-TEST-REF' },
  });
  const mine = await prisma.deal.create({
    data: { title: 'Rep deal', value: 50000, contactId: contact.id, ownerId: rep.id },
  });
  const theirs = await prisma.deal.create({
    data: { title: 'Other rep deal', value: 70000, contactId: contact.id, ownerId: otherRep.id },
  });
  repDealId = mine.id;
  otherDealId = theirs.id;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const ids = (res: request.Response) => res.body.data.map((d: { id: string }) => d.id);

describe('GET /api/v1/deals', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/v1/deals');
    expect(res.status).toBe(401);
  });

  it('a Sales Rep sees only their own deals', async () => {
    const res = await request(app).get('/api/v1/deals?pageSize=100').set(authHeader(rep));
    expect(res.status).toBe(200);
    expect(ids(res)).toContain(repDealId);
    expect(ids(res)).not.toContain(otherDealId);
    expect(res.body.data.every((d: { ownerId: string }) => d.ownerId === rep.id)).toBe(true);
  });

  it('returns value as a number with the contact name', async () => {
    const res = await request(app).get('/api/v1/deals?pageSize=100').set(authHeader(rep));
    const deal = res.body.data.find((d: { id: string }) => d.id === repDealId);
    expect(deal.value).toBe(50000);
    expect(deal.contactName).toBe('Deals Test Contact');
  });

  it('a Sales Manager sees every rep’s deals', async () => {
    const res = await request(app).get('/api/v1/deals?pageSize=100').set(authHeader(manager));
    expect(ids(res)).toEqual(expect.arrayContaining([repDealId, otherDealId]));
  });

  it('refuses Support with 403', async () => {
    const res = await request(app).get('/api/v1/deals').set(authHeader(support));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('PATCH /api/v1/deals/:id/stage', () => {
  it('TC-CONV-03 saves the new stage', async () => {
    const res = await request(app)
      .patch(`/api/v1/deals/${repDealId}/stage`)
      .set(authHeader(rep))
      .send({ stage: 'NEGOTIATION' });
    expect(res.status).toBe(200);
    expect(res.body.stage).toBe('NEGOTIATION');
    const stored = await prisma.deal.findUniqueOrThrow({ where: { id: repDealId } });
    expect(stored.stage).toBe('NEGOTIATION');
  });

  it('TC-CONV-04 moving to Won sets wonAt, and moving out clears it', async () => {
    const won = await request(app)
      .patch(`/api/v1/deals/${repDealId}/stage`)
      .set(authHeader(rep))
      .send({ stage: 'WON' });
    expect(won.status).toBe(200);
    expect(won.body.wonAt).not.toBeNull();

    const reopened = await request(app)
      .patch(`/api/v1/deals/${repDealId}/stage`)
      .set(authHeader(rep))
      .send({ stage: 'PROPOSAL' });
    expect(reopened.body.stage).toBe('PROPOSAL');
    expect(reopened.body.wonAt).toBeNull();
  });

  it('returns 400 for an unknown stage', async () => {
    const res = await request(app)
      .patch(`/api/v1/deals/${repDealId}/stage`)
      .set(authHeader(rep))
      .send({ stage: 'NOPE' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when the id is not a valid id', async () => {
    const res = await request(app)
      .patch('/api/v1/deals/not-an-id/stage')
      .set(authHeader(rep))
      .send({ stage: 'WON' });
    expect(res.status).toBe(400);
  });

  it('returns 403 when a rep moves another rep’s deal, and leaves it unchanged', async () => {
    const before = await prisma.deal.findUniqueOrThrow({ where: { id: otherDealId } });
    const res = await request(app)
      .patch(`/api/v1/deals/${otherDealId}/stage`)
      .set(authHeader(rep))
      .send({ stage: 'WON' });
    expect(res.status).toBe(403);
    const after = await prisma.deal.findUniqueOrThrow({ where: { id: otherDealId } });
    expect(after.stage).toBe(before.stage);
  });

  it('lets a Sales Manager move any deal', async () => {
    const res = await request(app)
      .patch(`/api/v1/deals/${otherDealId}/stage`)
      .set(authHeader(manager))
      .send({ stage: 'QUALIFIED' });
    expect(res.status).toBe(200);
    expect(res.body.stage).toBe('QUALIFIED');
  });

  it('returns 404 for a deal that does not exist', async () => {
    const res = await request(app)
      .patch(`/api/v1/deals/${randomUUID()}/stage`)
      .set(authHeader(rep))
      .send({ stage: 'WON' });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/deals', () => {
  it('creates a deal owned by the caller in the first stage', async () => {
    const res = await request(app)
      .post('/api/v1/deals')
      .set(authHeader(rep))
      .send({ title: 'New deal', value: 125000.5, contactId: contact.id });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: 'New deal',
      value: 125000.5,
      stage: 'PROSPECTING',
      ownerId: rep.id,
      contactName: 'Deals Test Contact',
    });
  });

  it('returns 404 for an unknown contact', async () => {
    const res = await request(app)
      .post('/api/v1/deals')
      .set(authHeader(rep))
      .send({ title: 'x', value: 1, contactId: randomUUID() });
    expect(res.status).toBe(404);
  });

  it('returns 400 for a missing title or a negative value', async () => {
    const noTitle = await request(app)
      .post('/api/v1/deals')
      .set(authHeader(rep))
      .send({ value: 1, contactId: contact.id });
    const negative = await request(app)
      .post('/api/v1/deals')
      .set(authHeader(rep))
      .send({ title: 'x', value: -5, contactId: contact.id });
    expect(noTitle.status).toBe(400);
    expect(negative.status).toBe(400);
  });

  it('refuses Support with 403', async () => {
    const res = await request(app)
      .post('/api/v1/deals')
      .set(authHeader(support))
      .send({ title: 'x', value: 1, contactId: contact.id });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/v1/deals/:id', () => {
  it('lets the owner change the title', async () => {
    const res = await request(app)
      .patch(`/api/v1/deals/${repDealId}`)
      .set(authHeader(rep))
      .send({ title: 'Renamed deal' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Renamed deal');
  });

  it('returns 400 for an empty change', async () => {
    const res = await request(app)
      .patch(`/api/v1/deals/${repDealId}`)
      .set(authHeader(rep))
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 403 when a rep edits another rep’s deal', async () => {
    const res = await request(app)
      .patch(`/api/v1/deals/${otherDealId}`)
      .set(authHeader(rep))
      .send({ title: 'Hacked' });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/deals/contacts', () => {
  it('finds contacts by name for the New deal form', async () => {
    const res = await request(app)
      .get('/api/v1/deals/contacts?search=Deals%20Test')
      .set(authHeader(rep));
    expect(res.status).toBe(200);
    expect(res.body.map((c: { id: string }) => c.id)).toContain(contact.id);
  });

  it('refuses Support with 403', async () => {
    const res = await request(app).get('/api/v1/deals/contacts').set(authHeader(support));
    expect(res.status).toBe(403);
  });
});
