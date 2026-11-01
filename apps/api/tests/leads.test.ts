import type { Role, User } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/common/prisma';
import { createLead } from '../src/modules/acquire';
import { authHeader } from './helpers';

const DOMAIN = '@leads-test.invalid';
const app = createApp();

let rep: User;
let otherRep: User;
let manager: User;
let marketing: User;
let support: User;

const makeUser = (role: Role, tag: string) =>
  prisma.user.create({
    data: { email: `${tag}${DOMAIN}`, passwordHash: 'not-a-real-hash', name: `Leads ${tag}`, role },
  });

async function cleanup() {
  await prisma.lead.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await prisma.contact.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
}

beforeAll(async () => {
  await cleanup();
  rep = await makeUser('SALES_REP', 'rep');
  otherRep = await makeUser('SALES_REP', 'otherrep');
  manager = await makeUser('SALES_MANAGER', 'manager');
  marketing = await makeUser('MARKETING', 'marketing');
  support = await makeUser('SUPPORT', 'support');
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const findLead = (email: string) => prisma.lead.findFirst({ where: { email } });

describe('POST /api/v1/public/leads (website form)', () => {
  it('TC-ACQ-01 saves a web enquiry with source WEB, no login needed', async () => {
    const res = await request(app)
      .post('/api/v1/public/leads')
      .send({
        name: '  Priya Sharma ',
        email: `Priya.Web${DOMAIN}`,
        phone: '+91 98450 12345',
        company: 'Sharma Traders',
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ received: true });

    const saved = await findLead(`priya.web${DOMAIN}`);
    expect(saved).toMatchObject({
      name: 'Priya Sharma',
      source: 'WEB',
      status: 'NEW',
      company: 'Sharma Traders',
      isDuplicate: false,
      ownerId: null,
    });
  });

  it('TC-ACQ-02 flags a second lead with the same email as a duplicate', async () => {
    const email = `dupe${DOMAIN}`;
    await request(app).post('/api/v1/public/leads').send({ name: 'First', email });
    const res = await request(app)
      .post('/api/v1/public/leads')
      .send({ name: 'Second', email: email.toUpperCase() });

    expect(res.status).toBe(201);
    const leads = await prisma.lead.findMany({ where: { email }, orderBy: { createdAt: 'asc' } });
    expect(leads.map((l) => l.isDuplicate)).toEqual([false, true]);
  });

  it('flags a lead whose email already belongs to a customer', async () => {
    const email = `existing-customer${DOMAIN}`;
    await prisma.contact.create({
      data: { name: 'Existing Customer', email, referralCode: 'LEADS-TEST-REF' },
    });
    await request(app).post('/api/v1/public/leads').send({ name: 'Returning', email });
    expect((await findLead(email))?.isDuplicate).toBe(true);
  });

  it('links the lead to a campaign and sets source CAMPAIGN', async () => {
    const campaign = await prisma.campaign.findFirst();
    if (!campaign) throw new Error('Seed data missing: run npm run seed');
    const email = `from-campaign${DOMAIN}`;
    await request(app)
      .post('/api/v1/public/leads')
      .send({ name: 'Campaign Lead', email, campaignId: campaign.id });
    expect(await findLead(email)).toMatchObject({ source: 'CAMPAIGN', campaignId: campaign.id });
  });

  it('ignores a campaign id that does not exist instead of failing', async () => {
    const email = `bad-campaign${DOMAIN}`;
    const res = await request(app)
      .post('/api/v1/public/leads')
      .send({ name: 'Lead', email, campaignId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(201);
    expect((await findLead(email))?.campaignId).toBeNull();
  });

  it('rejects missing name and bad email or phone with 400', async () => {
    for (const body of [
      { email: `noname${DOMAIN}` },
      { name: 'Bad Email', email: 'not-an-email' },
      { name: 'Bad Phone', email: `badphone${DOMAIN}`, phone: 'call me' },
    ]) {
      const res = await request(app).post('/api/v1/public/leads').send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('TC-SEC-06 silently drops bot submissions that fill the honeypot field', async () => {
    const email = `bot${DOMAIN}`;
    const res = await request(app)
      .post('/api/v1/public/leads')
      .send({ name: 'Bot', email, website: 'http://spam.example' });
    expect(res.status).toBe(201);
    expect(await findLead(email)).toBeNull();
  });
});

describe('POST /api/v1/leads (manual entry)', () => {
  it('a Sales Rep creates a lead that is assigned to them', async () => {
    const res = await request(app)
      .post('/api/v1/leads')
      .set(authHeader(rep))
      .send({ name: 'Rep Lead', email: `rep-lead${DOMAIN}` });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ source: 'MANUAL', ownerId: rep.id, ownerName: 'Leads rep' });
  });

  it('a manager or marketing lead starts unassigned and can set the source', async () => {
    const res = await request(app)
      .post('/api/v1/leads')
      .set(authHeader(marketing))
      .send({ name: 'Expo Lead', email: `expo${DOMAIN}`, source: 'REFERRAL' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ source: 'REFERRAL', ownerId: null });
  });

  it('returns 401 without a token and 403 for Support', async () => {
    const body = { name: 'X', email: `x${DOMAIN}` };
    expect((await request(app).post('/api/v1/leads').send(body)).status).toBe(401);
    expect(
      (await request(app).post('/api/v1/leads').set(authHeader(support)).send(body)).status,
    ).toBe(403);
  });
});

describe('GET /api/v1/leads', () => {
  let repLeadId = '';
  let otherLeadId = '';

  beforeAll(async () => {
    repLeadId = (
      await createLead({ name: 'Mine', email: `mine${DOMAIN}`, source: 'MANUAL', ownerId: rep.id })
    ).id;
    otherLeadId = (
      await createLead({
        name: 'Not Mine',
        email: `notmine${DOMAIN}`,
        source: 'MANUAL',
        ownerId: otherRep.id,
      })
    ).id;
  });

  const ids = (res: request.Response) => res.body.data.map((l: { id: string }) => l.id);

  it('a Sales Rep sees only their own leads', async () => {
    const res = await request(app).get('/api/v1/leads?pageSize=100').set(authHeader(rep));
    expect(res.status).toBe(200);
    expect(ids(res)).toContain(repLeadId);
    expect(ids(res)).not.toContain(otherLeadId);
  });

  it('a manager sees everyone’s leads, paginated', async () => {
    const res = await request(app).get('/api/v1/leads?pageSize=500').set(authHeader(manager));
    expect(res.status).toBe(200);
    expect(res.body.pageSize).toBe(100);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
  });

  it('searches by name, email or company and filters duplicates', async () => {
    const search = await request(app).get('/api/v1/leads?q=notmine').set(authHeader(manager));
    expect(ids(search)).toEqual([otherLeadId]);

    const dupes = await request(app)
      .get('/api/v1/leads?duplicates=true&pageSize=100')
      .set(authHeader(manager));
    expect(dupes.body.data.every((l: { isDuplicate: boolean }) => l.isDuplicate)).toBe(true);
  });

  it("returns 404 when a Sales Rep opens someone else's lead", async () => {
    const mine = await request(app).get(`/api/v1/leads/${repLeadId}`).set(authHeader(rep));
    const theirs = await request(app).get(`/api/v1/leads/${otherLeadId}`).set(authHeader(rep));
    expect(mine.status).toBe(200);
    expect(theirs.status).toBe(404);
  });
});

describe('PATCH /api/v1/leads/:id', () => {
  it('updates status and re-checks duplicates when the email changes', async () => {
    const lead = await createLead({
      name: 'Editable',
      email: `editable${DOMAIN}`,
      source: 'WEB',
      ownerId: rep.id,
    });
    const res = await request(app)
      .patch(`/api/v1/leads/${lead.id}`)
      .set(authHeader(rep))
      .send({ status: 'QUALIFIED', email: `dupe${DOMAIN}` });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'QUALIFIED', isDuplicate: true });
  });

  it("stops a Sales Rep editing someone else's lead", async () => {
    const lead = await createLead({
      name: 'Other',
      email: `other-edit${DOMAIN}`,
      source: 'WEB',
      ownerId: otherRep.id,
    });
    const res = await request(app)
      .patch(`/api/v1/leads/${lead.id}`)
      .set(authHeader(rep))
      .send({ status: 'CONTACTED' });
    expect(res.status).toBe(403);
  });

  it('does not allow setting CONVERTED by hand', async () => {
    const lead = await createLead({ name: 'C', email: `conv${DOMAIN}`, source: 'WEB' });
    const res = await request(app)
      .patch(`/api/v1/leads/${lead.id}`)
      .set(authHeader(manager))
      .send({ status: 'CONVERTED' });
    expect(res.status).toBe(400);
  });

  it('refuses edits to a lead that is already converted', async () => {
    const lead = await createLead({ name: 'Done', email: `done${DOMAIN}`, source: 'WEB' });
    await prisma.lead.update({ where: { id: lead.id }, data: { status: 'CONVERTED' } });
    const res = await request(app)
      .patch(`/api/v1/leads/${lead.id}`)
      .set(authHeader(manager))
      .send({ name: 'Renamed' });
    expect(res.status).toBe(409);
  });

  it('returns 404 for an unknown lead', async () => {
    const res = await request(app)
      .patch('/api/v1/leads/00000000-0000-0000-0000-000000000000')
      .set(authHeader(manager))
      .send({ status: 'CONTACTED' });
    expect(res.status).toBe(404);
  });
});

// Keep this last: it uses up the public form's rate limit for this test file.
describe('TC-SEC-06 rate limiting on the public form', () => {
  it('returns 429 after 100 submissions in a minute from one IP', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 101; i++) {
      // Honeypot filled, so nothing is written to the database.
      const res = await request(app)
        .post('/api/v1/public/leads')
        .send({ name: 'Bot', email: `flood${i}${DOMAIN}`, website: 'x' });
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
    expect(statuses.filter((s) => s === 201).length).toBeLessThanOrEqual(100);
  }, 30_000);
});
