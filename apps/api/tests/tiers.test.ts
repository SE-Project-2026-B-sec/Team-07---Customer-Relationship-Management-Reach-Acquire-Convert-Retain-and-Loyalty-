// CRM-25 (CRM-F-051) tests: TC-LOY-02 and the tier rules.
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/common/prisma';
import { tierFor } from '../src/modules/loyalty/tiers.service';

const app = createApp();
const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

async function auth(email: string) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: 'Password@123' });
  return { Authorization: `Bearer ${res.body.token}` };
}

const DEFAULTS = [
  { name: 'BRONZE', minPoints: 0 },
  { name: 'SILVER', minPoints: 500 },
  { name: 'GOLD', minPoints: 2000 },
  { name: 'PLATINUM', minPoints: 5000 },
] as const;

describe('Loyalty tiers (CRM-25)', () => {
  let support: Record<string, string>;
  let admin: Record<string, string>;
  let silverMin: number;
  const contactIds: string[] = [];

  async function newCustomer() {
    const id = unique();
    const c = await prisma.contact.create({
      data: {
        name: `Tier ${id}`,
        email: `tier${id}@example.com`,
        referralCode: `R${id}`.slice(0, 20),
      },
    });
    contactIds.push(c.id);
    return c.id;
  }

  const order = (contactId: string, amount: number) =>
    request(app).post('/api/v1/orders').set(support).send({ contactId, amount });

  beforeAll(async () => {
    // Use the seeded thresholds; only fill in a tier if the seed didn't create it.
    for (const t of DEFAULTS) {
      await prisma.tier.upsert({ where: { name: t.name }, update: {}, create: t });
    }
    silverMin = (await prisma.tier.findUniqueOrThrow({ where: { name: 'SILVER' } })).minPoints;
    support = await auth('support@crm.test');
    admin = await auth('admin@crm.test');
  });

  afterAll(async () => {
    await prisma.pointsLedger.deleteMany({ where: { contactId: { in: contactIds } } });
    await prisma.order.deleteMany({ where: { contactId: { in: contactIds } } });
    await prisma.contact.deleteMany({ where: { id: { in: contactIds } } });
    await prisma.$disconnect();
  });

  it('tierFor picks the highest tier reached', () => {
    const tiers = DEFAULTS.map((t) => ({ ...t }));
    expect(tierFor(0, tiers)).toBe('BRONZE');
    expect(tierFor(499, tiers)).toBe('BRONZE');
    expect(tierFor(500, tiers)).toBe('SILVER');
    expect(tierFor(2000, tiers)).toBe('GOLD');
    expect(tierFor(99999, tiers)).toBe('PLATINUM');
  });

  it('TC-LOY-02 crossing the Silver threshold changes the tier', async () => {
    const contactId = await newCustomer();

    // One point short of Silver: still Bronze.
    if (silverMin > 1) {
      const below = await order(contactId, (silverMin - 1) * 100);
      expect(below.status).toBe(201);
      expect(below.body.tier).toBe('BRONZE');
      expect(below.body.tierChanged).toBe(false);
    }

    // The next Rs 100 crosses the line.
    const cross = await order(contactId, silverMin > 1 ? 100 : silverMin * 100);
    expect(cross.status).toBe(201);
    expect(cross.body.tier).toBe('SILVER');
    expect(cross.body.tierChanged).toBe(true);

    expect((await prisma.contact.findUniqueOrThrow({ where: { id: contactId } })).tier).toBe(
      'SILVER',
    );
    const points = await request(app).get(`/api/v1/customers/${contactId}/points`).set(support);
    expect(points.body.tier).toBe('SILVER');
  });

  it('an order under Rs 100 never changes the tier', async () => {
    const contactId = await newCustomer();
    const res = await order(contactId, 50);
    expect(res.body.tier).toBe('BRONZE');
    expect(res.body.tierChanged).toBe(false);
  });

  it('lists the tiers in threshold order', async () => {
    const res = await request(app).get('/api/v1/tiers').set(support);
    expect(res.status).toBe(200);
    const mins = res.body.map((t: { minPoints: number }) => t.minPoints);
    expect(mins).toEqual([...mins].sort((a: number, b: number) => a - b));
    expect(res.body[0].name).toBe('BRONZE');
  });

  it('rejects thresholds that break the order, and non-admins', async () => {
    const gold = await prisma.tier.findUniqueOrThrow({ where: { name: 'GOLD' } });
    const tooHigh = await request(app)
      .patch('/api/v1/tiers/SILVER')
      .set(admin)
      .send({ minPoints: gold.minPoints + 1 });
    expect(tooHigh.status).toBe(400);
    expect(
      (await request(app).patch('/api/v1/tiers/BRONZE').set(admin).send({ minPoints: 10 })).status,
    ).toBe(400);
    expect(
      (await request(app).patch('/api/v1/tiers/DIAMOND').set(admin).send({ minPoints: 10 })).status,
    ).toBe(400);
    expect(
      (await request(app).patch('/api/v1/tiers/SILVER').set(support).send({ minPoints: 400 }))
        .status,
    ).toBe(403);
  });
});
