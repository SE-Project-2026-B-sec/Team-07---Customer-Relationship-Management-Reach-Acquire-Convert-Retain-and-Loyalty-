// CRM-15 tests: TC-ANA-04 (search account name -> account and its deals), validation (400),
// role scoping (rep sees only own records; support gets contacts and tickets), 5-per-type cap.
// Needs the database running and seeded (manager, rep, rep2, support, marketing @crm.test).
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/common/prisma';

const app = createApp();
const PASSWORD = 'Password@123';
const tag = `zq${Date.now()}${Math.floor(Math.random() * 1e6)}`;
// Separate tag so the 6 bulk contacts never match searches for `tag` (they would fill the 5-row cap).
const bulkTag = `zb${Date.now()}${Math.floor(Math.random() * 1e6)}`;
// Short unique referral codes (the column is unique).
const refCode = (n: string) => `X${tag.slice(-8)}${n}`;

async function login(email: string) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return { headers: { Authorization: `Bearer ${res.body.token}` }, userId: res.body.user.id };
}

const search = (headers: Record<string, string>, q: string) =>
  request(app).get('/api/v1/search').query({ q }).set(headers);

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('Global search (CRM-15)', () => {
  let manager: Record<string, string>;
  let rep: Record<string, string>;
  let marketing: Record<string, string>;
  let support: Record<string, string>;

  let accountId: string;
  let repContactId: string;
  let rep2ContactId: string;
  let repLeadId: string;
  let rep2LeadId: string;
  let dealId: string;
  let ticketId: string;

  beforeAll(async () => {
    const m = await login('manager@crm.test');
    const r = await login('rep@crm.test');
    const r2 = await login('rep2@crm.test');
    const mk = await login('marketing@crm.test');
    const s = await login('support@crm.test');
    manager = m.headers;
    rep = r.headers;
    marketing = mk.headers;
    support = s.headers;

    const account = await prisma.account.create({ data: { name: `${tag} Industries` } });
    accountId = account.id;

    const repContact = await prisma.contact.create({
      data: {
        name: `${tag} Rep Contact`,
        email: `${tag}-rep@example.com`,
        referralCode: refCode('a'),
        ownerId: r.userId,
        accountId,
      },
    });
    repContactId = repContact.id;
    const rep2Contact = await prisma.contact.create({
      data: {
        name: `${tag} Rep2 Contact`,
        email: `${tag}-rep2@example.com`,
        referralCode: refCode('b'),
        ownerId: r2.userId,
      },
    });
    rep2ContactId = rep2Contact.id;

    repLeadId = (
      await prisma.lead.create({
        data: { name: `${tag} Rep Lead`, email: `${tag}-lead1@example.com`, ownerId: r.userId },
      })
    ).id;
    rep2LeadId = (
      await prisma.lead.create({
        data: { name: `${tag} Rep2 Lead`, email: `${tag}-lead2@example.com`, ownerId: r2.userId },
      })
    ).id;

    // The deal title does not contain the tag: it must be found through its account name.
    dealId = (
      await prisma.deal.create({
        data: {
          title: 'Annual licence renewal',
          value: 1000,
          contactId: repContactId,
          accountId,
          ownerId: r.userId,
        },
      })
    ).id;

    ticketId = (
      await prisma.ticket.create({
        data: {
          subject: `${tag} printer is broken`,
          description: 'Test ticket',
          slaDueAt: new Date(Date.now() + 86_400_000),
          contactId: repContactId,
        },
      })
    ).id;

    // Six matching contacts to prove the cap of 5 per type.
    await prisma.contact.createMany({
      data: Array.from({ length: 6 }, (_, i) => ({
        name: `${bulkTag} Contact ${i}`,
        email: `${bulkTag}-${i}@example.com`,
        referralCode: refCode(`c${i}`),
      })),
    });
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({ where: { id: ticketId } });
    await prisma.deal.deleteMany({ where: { id: dealId } });
    await prisma.lead.deleteMany({ where: { id: { in: [repLeadId, rep2LeadId] } } });
    await prisma.contact.deleteMany({
      where: {
        OR: [{ id: { in: [repContactId, rep2ContactId] } }, { name: { startsWith: bulkTag } }],
      },
    });
    await prisma.account.deleteMany({ where: { id: accountId } });
    await prisma.$disconnect();
  });

  it('TC-ANA-04 searching an account name returns the account and its deals', async () => {
    const res = await search(manager, `${tag} Industries`);
    expect(res.status).toBe(200);
    expect(ids(res.body.accounts)).toEqual([accountId]);
    expect(ids(res.body.deals)).toContain(dealId);
  });

  it('CRM-15 returns all five groups and ignores letter case', async () => {
    const res = await search(manager, tag.toUpperCase());
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([
      'accounts',
      'contacts',
      'deals',
      'leads',
      'tickets',
    ]);
    expect(ids(res.body.leads)).toEqual(expect.arrayContaining([repLeadId, rep2LeadId]));
    expect(ids(res.body.tickets)).toContain(ticketId);
  });

  it('CRM-15 returns 400 for a 1-character query and when q is missing', async () => {
    expect((await search(manager, 'a')).status).toBe(400);
    expect((await search(manager, '  a  ')).status).toBe(400);
    const missing = await request(app).get('/api/v1/search').set(manager);
    expect(missing.status).toBe(400);
  });

  it('CRM-15 returns 401 without a token', async () => {
    const res = await request(app).get('/api/v1/search').query({ q: tag });
    expect(res.status).toBe(401);
  });

  it('CRM-15 returns at most 5 results per type', async () => {
    const res = await search(manager, bulkTag);
    expect(res.status).toBe(200);
    expect(res.body.contacts).toHaveLength(5);
  });

  it('CRM-15 a Sales Rep does not see another rep’s contact or lead', async () => {
    const res = await search(rep, tag);
    expect(res.status).toBe(200);
    expect(ids(res.body.contacts)).toContain(repContactId);
    expect(ids(res.body.contacts)).not.toContain(rep2ContactId);
    expect(ids(res.body.leads)).toContain(repLeadId);
    expect(ids(res.body.leads)).not.toContain(rep2LeadId);
    expect(ids(res.body.deals)).toContain(dealId);
  });

  it('CRM-15 a Sales Rep gets no accounts or tickets', async () => {
    const res = await search(rep, tag);
    expect(res.body.accounts).toEqual([]);
    expect(res.body.tickets).toEqual([]);
  });

  it('CRM-15 Support gets contacts and tickets only', async () => {
    const res = await search(support, tag);
    expect(res.status).toBe(200);
    expect(ids(res.body.contacts)).toEqual(expect.arrayContaining([repContactId, rep2ContactId]));
    expect(ids(res.body.tickets)).toContain(ticketId);
    expect(res.body.leads).toEqual([]);
    expect(res.body.accounts).toEqual([]);
    expect(res.body.deals).toEqual([]);
  });

  it('CRM-15 Marketing gets leads only', async () => {
    const res = await search(marketing, tag);
    expect(res.status).toBe(200);
    expect(ids(res.body.leads)).toEqual(expect.arrayContaining([repLeadId, rep2LeadId]));
    expect(res.body.contacts).toEqual([]);
    expect(res.body.deals).toEqual([]);
  });
});
