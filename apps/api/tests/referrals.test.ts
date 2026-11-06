// CRM-27 (CRM-F-053) tests: TC-LOY-04 and the referral rules.
import type { Role, User } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/common/prisma';
import { DEFAULT_REFERRAL_BONUS, referralBonus } from '../src/modules/loyalty/referrals.service';
import { authHeader } from './helpers';

const DOMAIN = '@referral-test.invalid';
const ACCOUNT = 'RefTest account';
const app = createApp();
const BONUS = DEFAULT_REFERRAL_BONUS;

let admin: User;
let rep: User;
let support: User;
let n = 0;

const makeUser = (role: Role, tag: string) =>
  prisma.user.create({
    data: { email: `${tag}${DOMAIN}`, passwordHash: 'x', name: `Referral ${tag}`, role },
  });

/** A customer with a referral code and, optionally, some points already. */
async function customer(points = 0) {
  n += 1;
  const c = await prisma.contact.create({
    data: { name: `Referrer ${n}`, email: `referrer${n}${DOMAIN}`, referralCode: `RTEST${n}X` },
  });
  if (points) {
    await prisma.pointsLedger.create({
      data: { contactId: c.id, delta: points, reason: 'EARN', balanceAfter: points },
    });
  }
  return c;
}

const balanceOf = async (contactId: string) =>
  (
    await prisma.pointsLedger.findFirst({
      where: { contactId },
      orderBy: [{ createdAt: 'desc' }, { balanceAfter: 'desc' }],
    })
  )?.balanceAfter ?? 0;

const newContact = (body: object) =>
  request(app).post('/api/v1/contacts').set(authHeader(admin)).send(body);

const qualifiedLead = (tag: string) =>
  prisma.lead.create({
    data: { name: `Lead ${tag}`, email: `${tag}${DOMAIN}`, status: 'QUALIFIED', ownerId: admin.id },
  });

const convert = (leadId: string, body: object) =>
  request(app)
    .post(`/api/v1/leads/${leadId}/convert`)
    .set(authHeader(admin))
    .send({ accountName: ACCOUNT, ...body });

async function cleanup() {
  const contacts = { email: { endsWith: DOMAIN } };
  await prisma.referral.deleteMany({
    where: { OR: [{ referrer: contacts }, { referee: contacts }] },
  });
  await prisma.pointsLedger.deleteMany({ where: { contact: contacts } });
  await prisma.lead.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await prisma.contact.deleteMany({ where: contacts });
  await prisma.account.deleteMany({ where: { name: ACCOUNT } });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
}

beforeAll(async () => {
  await cleanup();
  admin = await makeUser('ADMIN', 'admin');
  rep = await makeUser('SALES_REP', 'rep');
  support = await makeUser('SUPPORT', 'support');
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('CRM-27 referral codes and bonus points', () => {
  it('TC-LOY-04 a new customer with a referral code gives the referrer the bonus', async () => {
    const referrer = await customer(40);

    // Codes are not case-sensitive.
    const res = await newContact({
      name: 'New Friend',
      email: `friend1${DOMAIN}`,
      referredByCode: referrer.referralCode.toLowerCase(),
    });
    expect(res.status).toBe(201);

    expect(await balanceOf(referrer.id)).toBe(40 + BONUS);
    const row = await prisma.pointsLedger.findFirst({
      where: { contactId: referrer.id, reason: 'REFERRAL' },
    });
    expect(row).toMatchObject({ delta: BONUS, balanceAfter: 40 + BONUS, orderId: null });

    // The points API (CRM-24) sees the same balance.
    const points = await request(app)
      .get(`/api/v1/customers/${referrer.id}/points`)
      .set(authHeader(support));
    expect(points.body.balance).toBe(40 + BONUS);

    const list = await request(app)
      .get(`/api/v1/customers/${referrer.id}/referrals`)
      .set(authHeader(support));
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({
      referralCode: referrer.referralCode,
      bonusPerReferral: BONUS,
      bonusEarned: BONUS,
      referredBy: null,
      referrals: [{ customerId: res.body.id, customerName: 'New Friend', bonusAwarded: true }],
    });

    const friend = await request(app)
      .get(`/api/v1/customers/${res.body.id}/referrals`)
      .set(authHeader(admin));
    expect(friend.body.referredBy).toMatchObject({ id: referrer.id, name: referrer.name });
    expect(friend.body.referrals).toEqual([]);
  });

  it('gives a bonus for every customer referred', async () => {
    const referrer = await customer();
    await newContact({
      name: 'A',
      email: `multi-a${DOMAIN}`,
      referredByCode: referrer.referralCode,
    });
    await newContact({
      name: 'B',
      email: `multi-b${DOMAIN}`,
      referredByCode: referrer.referralCode,
    });
    expect(await balanceOf(referrer.id)).toBe(2 * BONUS);
    expect(await prisma.referral.count({ where: { referrerId: referrer.id } })).toBe(2);
  });

  it('an unknown code is refused and nothing is created', async () => {
    const res = await newContact({
      name: 'Nobody',
      email: `nobody${DOMAIN}`,
      referredByCode: 'NOSUCHCODE',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REFERRAL_CODE');
    expect(await prisma.contact.count({ where: { email: `nobody${DOMAIN}` } })).toBe(0);
  });

  it('a contact created without a code works exactly as before', async () => {
    const res = await newContact({ name: 'Plain', email: `plain${DOMAIN}` });
    expect(res.status).toBe(201);
    expect(await prisma.referral.count({ where: { refereeId: res.body.id } })).toBe(0);
  });

  it('the bonus counts towards the loyalty tier (CRM-25)', async () => {
    const referrer = await customer(450); // Bronze; Silver starts at 500
    await newContact({
      name: 'Tier',
      email: `tier${DOMAIN}`,
      referredByCode: referrer.referralCode,
    });
    const after = await prisma.contact.findUniqueOrThrow({ where: { id: referrer.id } });
    expect(after.tier).toBe('SILVER');
  });

  it('converting a lead with a referral code gives the referrer the bonus', async () => {
    const referrer = await customer(10);
    const lead = await qualifiedLead('convert-ok');
    const res = await convert(lead.id, { referredByCode: referrer.referralCode });
    expect(res.status).toBe(201);
    expect(res.body.referral).toEqual({ referrerName: referrer.name, bonus: BONUS });
    expect(await balanceOf(referrer.id)).toBe(10 + BONUS);
  });

  it('no bonus when the lead turns out to be an existing customer', async () => {
    const referrer = await customer();
    await customer(); // creates referrer{n}
    const existingEmail = `referrer${n}${DOMAIN}`;
    const lead = await prisma.lead.create({
      data: { name: 'Already a customer', email: existingEmail, status: 'QUALIFIED' },
    });
    const res = await convert(lead.id, { referredByCode: referrer.referralCode });
    expect(res.status).toBe(201);
    expect(res.body.referral).toBeNull();
    expect(await balanceOf(referrer.id)).toBe(0);
  });

  it('a bad code during conversion rolls the whole conversion back', async () => {
    const lead = await qualifiedLead('convert-bad');
    const res = await convert(lead.id, { referredByCode: 'NOSUCHCODE' });
    expect(res.status).toBe(400);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe(
      'QUALIFIED',
    );
    expect(await prisma.contact.count({ where: { email: `convert-bad${DOMAIN}` } })).toBe(0);
  });

  it('only Admin, Support and Sales Manager can see referrals', async () => {
    const referrer = await customer();
    const url = `/api/v1/customers/${referrer.id}/referrals`;
    expect((await request(app).get(url).set(authHeader(rep))).status).toBe(403);
    expect((await request(app).get(url)).status).toBe(401);
    expect(
      (
        await request(app)
          .get('/api/v1/customers/00000000-0000-4000-8000-000000000000/referrals')
          .set(authHeader(admin))
      ).status,
    ).toBe(404);
  });

  it('the bonus is configurable with REFERRAL_BONUS_POINTS', () => {
    expect(referralBonus({})).toBe(100);
    expect(referralBonus({ REFERRAL_BONUS_POINTS: '250' })).toBe(250);
    expect(referralBonus({ REFERRAL_BONUS_POINTS: 'abc' })).toBe(100);
    expect(referralBonus({ REFERRAL_BONUS_POINTS: '-5' })).toBe(100);
  });
});
