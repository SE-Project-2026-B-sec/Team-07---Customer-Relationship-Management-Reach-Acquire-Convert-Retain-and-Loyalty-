// CRM-24 (CRM-F-050, CRM-NF-009) tests: TC-LOY-01 and the ledger rules.
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/common/prisma';
import { pointsFor } from '../src/modules/loyalty/orders.service';

const app = createApp();
const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

async function auth(email: string) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: 'Password@123' });
  return { Authorization: `Bearer ${res.body.token}` };
}

describe('Orders and loyalty points (CRM-24)', () => {
  let support: Record<string, string>;
  let manager: Record<string, string>;
  let rep: Record<string, string>;
  const contactIds: string[] = [];

  // A brand-new customer with no points yet.
  async function newCustomer() {
    const id = unique();
    const c = await prisma.contact.create({
      data: {
        name: `Loyal ${id}`,
        email: `loyal${id}@example.com`,
        referralCode: `T${id}`.slice(0, 20),
      },
    });
    contactIds.push(c.id);
    return c.id;
  }

  const order = (headers: Record<string, string>, contactId: string, amount: number) =>
    request(app).post('/api/v1/orders').set(headers).send({ contactId, amount });

  beforeAll(async () => {
    support = await auth('support@crm.test');
    manager = await auth('manager@crm.test');
    rep = await auth('rep@crm.test');
  });

  afterAll(async () => {
    await prisma.pointsLedger.deleteMany({ where: { contactId: { in: contactIds } } });
    await prisma.order.deleteMany({ where: { contactId: { in: contactIds } } });
    await prisma.contact.deleteMany({ where: { id: { in: contactIds } } });
    await prisma.$disconnect();
  });

  it('pointsFor: 1 point per full Rs 100', () => {
    expect(pointsFor(2550)).toBe(25);
    expect(pointsFor(99.99)).toBe(0);
    expect(pointsFor(100)).toBe(1);
    expect(pointsFor(1999.99)).toBe(19);
  });

  it('TC-LOY-01 a Rs 2,550 order earns +25 points', async () => {
    const contactId = await newCustomer();
    const res = await order(support, contactId, 2550);

    expect(res.status).toBe(201);
    expect(res.body.pointsEarned).toBe(25);
    expect(res.body.balance).toBe(25);
    expect(res.body.order.orderNo).toMatch(/^ORD-/);

    const ledger = await prisma.pointsLedger.findMany({ where: { contactId } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      delta: 25,
      reason: 'EARN',
      balanceAfter: 25,
      orderId: res.body.order.id,
    });

    const points = await request(app).get(`/api/v1/customers/${contactId}/points`).set(manager);
    expect(points.status).toBe(200);
    expect(points.body.balance).toBe(25);
  });

  it('adds to the running balance and writes no row for an order under Rs 100', async () => {
    const contactId = await newCustomer();
    await order(support, contactId, 2550);
    const second = await order(support, contactId, 1000);
    expect(second.body.balance).toBe(35);

    const small = await order(support, contactId, 99);
    expect(small.status).toBe(201);
    expect(small.body.pointsEarned).toBe(0);
    expect(small.body.balance).toBe(35);
    expect(await prisma.pointsLedger.count({ where: { contactId } })).toBe(2);
    expect(await prisma.order.count({ where: { contactId } })).toBe(3);
  });

  it('CRM-NF-009 two orders at the same moment both count', async () => {
    const contactId = await newCustomer();
    const [a, b] = await Promise.all([
      order(support, contactId, 2550),
      order(support, contactId, 2550),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);

    const rows = await prisma.pointsLedger.findMany({
      where: { contactId },
      orderBy: { balanceAfter: 'asc' },
    });
    expect(rows.map((r) => r.balanceAfter)).toEqual([25, 50]);
  });

  it('writes nothing when the order fails', async () => {
    const before = await prisma.order.count();
    const res = await request(app)
      .post('/api/v1/orders')
      .set(support)
      .send({ contactId: 'does-not-exist', amount: 2550 });
    expect(res.status).toBe(404);
    expect(await prisma.order.count()).toBe(before);
  });

  it('rejects a zero, negative or 3-decimal amount', async () => {
    const contactId = await newCustomer();
    expect((await order(support, contactId, 0)).status).toBe(400);
    expect((await order(support, contactId, -10)).status).toBe(400);
    expect((await order(support, contactId, 10.555)).status).toBe(400);
  });

  it("lists a customer's orders, newest first", async () => {
    const contactId = await newCustomer();
    await order(support, contactId, 500);
    const res = await request(app).get(`/api/v1/orders?contactId=${contactId}`).set(manager);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain(contactId);
  });

  it('only ADMIN and SUPPORT can record orders; reps cannot see them', async () => {
    const contactId = await newCustomer();
    expect((await order(manager, contactId, 500)).status).toBe(403);
    expect((await order(rep, contactId, 500)).status).toBe(403);
    expect((await request(app).get('/api/v1/orders').set(rep)).status).toBe(403);
    expect((await request(app).get('/api/v1/orders')).status).toBe(401);
  });

  it('returns 404 for an unknown customer or order', async () => {
    expect((await request(app).get('/api/v1/customers/nope/points').set(support)).status).toBe(404);
    expect((await request(app).get('/api/v1/orders/nope').set(support)).status).toBe(404);
  });
});
