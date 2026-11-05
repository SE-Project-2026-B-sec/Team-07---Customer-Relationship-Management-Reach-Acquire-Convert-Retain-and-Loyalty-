// CRM-26 (CRM-F-052) tests: TC-LOY-03 (insufficient points -> 409), TC-OPS-04 (no double spend).
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/common/prisma';

const app = createApp();
const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

async function auth(email: string) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: 'Password@123' });
  return { Authorization: `Bearer ${res.body.token}` };
}

describe('Rewards and redemption (CRM-26)', () => {
  let admin: Record<string, string>;
  let support: Record<string, string>;
  let rep: Record<string, string>;
  const contactIds: string[] = [];
  const rewardIds: string[] = [];

  // A customer with exactly `points` points, earned through a real order.
  async function customerWith(points: number) {
    const id = unique();
    const c = await prisma.contact.create({
      data: {
        name: `Redeem ${id}`,
        email: `redeem${id}@example.com`,
        referralCode: `W${id}`.slice(0, 20),
      },
    });
    contactIds.push(c.id);
    if (points > 0) {
      const res = await request(app)
        .post('/api/v1/orders')
        .set(support)
        .send({ contactId: c.id, amount: points * 100 });
      expect(res.body.balance).toBe(points);
    }
    return c.id;
  }

  async function reward(pointsCost: number, stock = 10, isActive = true) {
    const r = await prisma.reward.create({
      data: { name: `Reward ${unique()}`, pointsCost, stock, isActive },
    });
    rewardIds.push(r.id);
    return r.id;
  }

  const redeem = (rewardId: string, contactId: string, headers = support) =>
    request(app).post(`/api/v1/rewards/${rewardId}/redeem`).set(headers).send({ contactId });

  beforeAll(async () => {
    admin = await auth('admin@crm.test');
    support = await auth('support@crm.test');
    rep = await auth('rep@crm.test');
  });

  afterAll(async () => {
    await prisma.redemption.deleteMany({ where: { contactId: { in: contactIds } } });
    await prisma.pointsLedger.deleteMany({ where: { contactId: { in: contactIds } } });
    await prisma.order.deleteMany({ where: { contactId: { in: contactIds } } });
    await prisma.contact.deleteMany({ where: { id: { in: contactIds } } });
    await prisma.reward.deleteMany({ where: { id: { in: rewardIds } } });
    await prisma.$disconnect();
  });

  it('redeems a reward: points go down, stock goes down, ledger and redemption written', async () => {
    const contactId = await customerWith(150);
    const rewardId = await reward(100, 5);

    const res = await redeem(rewardId, contactId);
    expect(res.status).toBe(201);
    expect(res.body.pointsSpent).toBe(100);
    expect(res.body.balance).toBe(50);

    const row = await prisma.pointsLedger.findFirstOrThrow({
      where: { contactId, reason: 'REDEEM' },
    });
    expect(row).toMatchObject({ delta: -100, balanceAfter: 50 });
    expect(await prisma.redemption.count({ where: { contactId, ledgerId: row.id } })).toBe(1);
    expect((await prisma.reward.findUniqueOrThrow({ where: { id: rewardId } })).stock).toBe(4);

    const points = await request(app).get(`/api/v1/customers/${contactId}/points`).set(support);
    expect(points.body.balance).toBe(50);
  });

  it('TC-LOY-03 not enough points -> 409 and nothing is written', async () => {
    const contactId = await customerWith(40);
    const rewardId = await reward(100, 5);

    const res = await redeem(rewardId, contactId);
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toContain('INSUFFICIENT_POINTS');

    expect(await prisma.pointsLedger.count({ where: { contactId, reason: 'REDEEM' } })).toBe(0);
    expect(await prisma.redemption.count({ where: { contactId } })).toBe(0);
    expect((await prisma.reward.findUniqueOrThrow({ where: { id: rewardId } })).stock).toBe(5);
  });

  it('TC-OPS-04 two redemptions at the same moment cannot spend the same points', async () => {
    const contactId = await customerWith(100);
    const rewardId = await reward(100, 5);

    const results = await Promise.all([redeem(rewardId, contactId), redeem(rewardId, contactId)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);

    expect(await prisma.redemption.count({ where: { contactId } })).toBe(1);
    const latest = await request(app).get(`/api/v1/customers/${contactId}/points`).set(support);
    expect(latest.body.balance).toBe(0);
    expect((await prisma.reward.findUniqueOrThrow({ where: { id: rewardId } })).stock).toBe(4);
  });

  it('out of stock or inactive -> 409', async () => {
    const contactId = await customerWith(500);
    expect((await redeem(await reward(100, 0), contactId)).status).toBe(409);
    expect((await redeem(await reward(100, 5, false), contactId)).status).toBe(409);
  });

  it('redeeming does not lower the tier', async () => {
    const contactId = await customerWith(600);
    const before = (await prisma.contact.findUniqueOrThrow({ where: { id: contactId } })).tier;
    expect((await redeem(await reward(500, 5), contactId)).status).toBe(201);
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: contactId } })).tier).toBe(
      before,
    );
  });

  it('returns 404 for an unknown reward or customer', async () => {
    const contactId = await customerWith(0);
    expect((await redeem('nope', contactId)).status).toBe(404);
    expect((await redeem(await reward(10), 'nope')).status).toBe(404);
  });

  it('admin manages the catalogue; others only read; reps cannot redeem', async () => {
    const created = await request(app)
      .post('/api/v1/rewards')
      .set(admin)
      .send({ name: `Mug ${unique()}`, pointsCost: 200, stock: 3 });
    expect(created.status).toBe(201);
    rewardIds.push(created.body.id);

    const hidden = await request(app)
      .patch(`/api/v1/rewards/${created.body.id}`)
      .set(admin)
      .send({ isActive: false });
    expect(hidden.body.isActive).toBe(false);

    const asSupport = await request(app).get('/api/v1/rewards').set(support);
    expect(asSupport.status).toBe(200);
    expect(asSupport.body.map((r: { id: string }) => r.id)).not.toContain(created.body.id);
    const asAdmin = await request(app).get('/api/v1/rewards').set(admin);
    expect(asAdmin.body.map((r: { id: string }) => r.id)).toContain(created.body.id);

    expect(
      (await request(app).post('/api/v1/rewards').set(support).send({ name: 'X', pointsCost: 1 }))
        .status,
    ).toBe(403);
    expect(
      (await request(app).post('/api/v1/rewards').set(admin).send({ name: 'X', pointsCost: 0 }))
        .status,
    ).toBe(400);
    const contactId = await customerWith(0);
    expect((await redeem(created.body.id, contactId, rep)).status).toBe(403);
  });

  it("shows a customer's redemption history", async () => {
    const contactId = await customerWith(100);
    await redeem(await reward(100), contactId);
    const res = await request(app).get(`/api/v1/customers/${contactId}/redemptions`).set(support);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].reward.pointsCost).toBe(100);
  });
});
