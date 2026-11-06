// CRM-30 (CRM-F-034) tests: TC-CONV-08 and the quote rules.
import type { Role, User } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/common/prisma';
import { quoteTotals } from '../src/modules/convert/quotes.totals';
import { authHeader } from './helpers';

const DOMAIN = '@quote-test.invalid';
const app = createApp();

let admin: User;
let manager: User;
let rep: User;
let otherRep: User;
let marketing: User;
let dealId: string;
let otherRepDealId: string;

const makeUser = (role: Role, tag: string) =>
  prisma.user.create({
    data: { email: `${tag}${DOMAIN}`, passwordHash: 'x', name: `Quote ${tag}`, role },
  });

/** TC-CONV-08: 2 items and 10% discount. */
const TWO_ITEMS = {
  items: [
    { description: 'Annual CRM licence', quantity: 2, unitPrice: 50000 },
    { description: 'Onboarding and training', quantity: 1, unitPrice: 20000 },
  ],
  discountPct: 10,
};

const createQuote = (id: string, body: object, user: User = rep) =>
  request(app).post(`/api/v1/deals/${id}/quotes`).set(authHeader(user)).send(body);

/** Supertest reads binary bodies as a Buffer with this parser. */
function binary(res: unknown, cb: (err: Error | null, body: Buffer) => void) {
  const stream = res as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  stream.on('data', (c: Buffer) => chunks.push(c));
  stream.on('end', () => cb(null, Buffer.concat(chunks)));
}

const pdf = (quoteId: string, user: User = rep) =>
  request(app)
    .get(`/api/v1/quotes/${quoteId}/pdf`)
    .set(authHeader(user))
    .buffer(true)
    .parse(binary);

async function cleanup() {
  const where = { owner: { email: { endsWith: DOMAIN } } };
  await prisma.quote.deleteMany({ where: { deal: where } });
  await prisma.deal.deleteMany({ where });
  await prisma.contact.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await prisma.account.deleteMany({ where: { name: 'QuoteTest Pvt Ltd' } });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
}

beforeAll(async () => {
  await cleanup();
  admin = await makeUser('ADMIN', 'admin');
  manager = await makeUser('SALES_MANAGER', 'manager');
  rep = await makeUser('SALES_REP', 'rep');
  otherRep = await makeUser('SALES_REP', 'other-rep');
  marketing = await makeUser('MARKETING', 'marketing');
  const account = await prisma.account.create({ data: { name: 'QuoteTest Pvt Ltd' } });
  const contact = await prisma.contact.create({
    data: {
      name: 'Meera Nair',
      email: `meera${DOMAIN}`,
      phone: '9876543210',
      city: 'Bengaluru',
      referralCode: 'QTEST001',
      accountId: account.id,
    },
  });
  const deal = (owner: User, title: string) =>
    prisma.deal.create({
      data: {
        title,
        value: 108000,
        contactId: contact.id,
        accountId: account.id,
        ownerId: owner.id,
      },
    });
  dealId = (await deal(rep, 'QuoteTest CRM rollout')).id;
  otherRepDealId = (await deal(otherRep, 'QuoteTest other deal')).id;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('CRM-30 quotes and quote PDF', () => {
  it('TC-CONV-08 a quote with 2 items and 10% discount has the correct total and downloads as a PDF', async () => {
    const res = await createQuote(dealId, TWO_ITEMS);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      dealId,
      subtotal: 120000,
      discountPct: 10,
      discount: 12000,
      total: 108000,
      items: [
        { description: 'Annual CRM licence', quantity: 2, unitPrice: 50000, amount: 100000 },
        { description: 'Onboarding and training', quantity: 1, unitPrice: 20000, amount: 20000 },
      ],
    });
    expect(res.body.number).toMatch(/^Q-\d{8}-[0-9A-F]{4}$/);

    // Saved in the Quote table with the same total.
    const saved = await prisma.quote.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(saved.total.toNumber()).toBe(108000);
    expect(saved.discountPct.toNumber()).toBe(10);

    const file = await pdf(res.body.id);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(file.headers['content-disposition']).toBe(
      `attachment; filename="${res.body.number}.pdf"`,
    );
    const body = file.body as Buffer;
    expect(body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(body.subarray(-6).toString()).toContain('%%EOF');
    expect(body.length).toBeGreaterThan(1000);
  });

  it('lists the quotes on a deal, newest first', async () => {
    await createQuote(dealId, {
      items: [{ description: 'Extra seat', quantity: 3, unitPrice: 999.99 }],
    });
    const res = await request(app).get(`/api/v1/deals/${dealId}/quotes`).set(authHeader(rep));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    expect(res.body[0]).toMatchObject({ subtotal: 2999.97, discount: 0, total: 2999.97 });
    const times = res.body.map((q: { createdAt: string }) => Date.parse(q.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('rejects quotes with no items, bad numbers or a discount over 100%', async () => {
    for (const body of [
      { items: [] },
      { items: [{ description: '', quantity: 1, unitPrice: 10 }] },
      { items: [{ description: 'X', quantity: 0, unitPrice: 10 }] },
      { items: [{ description: 'X', quantity: 1.5, unitPrice: 10 }] },
      { items: [{ description: 'X', quantity: 1, unitPrice: -1 }] },
      { items: [{ description: 'X', quantity: 1, unitPrice: 10.555 }] },
      { items: [{ description: 'X', quantity: 1, unitPrice: 10 }], discountPct: 101 },
    ]) {
      const res = await createQuote(dealId, body);
      expect(res.status).toBe(400);
    }
  });

  it('a Sales Rep can only quote and download their own deals', async () => {
    expect((await createQuote(otherRepDealId, TWO_ITEMS)).status).toBe(403);
    const theirs = await createQuote(otherRepDealId, TWO_ITEMS, otherRep);
    expect(theirs.status).toBe(201);
    expect((await pdf(theirs.body.id)).status).toBe(403);
    expect(
      (await request(app).get(`/api/v1/deals/${otherRepDealId}/quotes`).set(authHeader(rep)))
        .status,
    ).toBe(403);
    // Managers and Admin can see every deal's quotes.
    expect((await pdf(theirs.body.id, manager)).status).toBe(200);
    expect((await pdf(theirs.body.id, admin)).status).toBe(200);
  });

  it('roles outside sales cannot use quotes', async () => {
    expect((await createQuote(dealId, TWO_ITEMS, marketing)).status).toBe(403);
    expect((await request(app).get(`/api/v1/deals/${dealId}/quotes`)).status).toBe(401);
  });

  it('404 for an unknown deal or quote, 400 for a bad id', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    expect((await createQuote(missing, TWO_ITEMS, admin)).status).toBe(404);
    expect((await pdf(missing, admin)).status).toBe(404);
    expect((await pdf('not-a-uuid', admin)).status).toBe(400);
  });
});

describe('quoteTotals', () => {
  it('works in paise so totals have no rounding errors', () => {
    const t = quoteTotals(
      [
        { description: 'a', quantity: 3, unitPrice: 0.1 },
        { description: 'b', quantity: 1, unitPrice: 0.2 },
      ],
      0,
    );
    expect(t.subtotal).toBe(0.5);
    expect(t.total).toBe(0.5);
  });

  it('rounds the discount to the nearest paisa', () => {
    const t = quoteTotals([{ description: 'a', quantity: 1, unitPrice: 999.99 }], 12.5);
    expect(t.discount).toBe(125);
    expect(t.total).toBe(874.99);
  });

  it('a 100% discount makes the total zero', () => {
    expect(quoteTotals([{ description: 'a', quantity: 2, unitPrice: 10 }], 100).total).toBe(0);
  });
});
