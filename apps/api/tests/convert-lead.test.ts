// CRM-13 (CRM-F-032, CRM-NF-009) tests: TC-CONV-05, TC-CONV-06 and the error cases.
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/common/prisma';

const app = createApp();
const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

async function login(email: string) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: 'Password@123' });
  return {
    headers: { Authorization: `Bearer ${res.body.token}` },
    userId: res.body.user.id as string,
  };
}

// Creates a lead straight in the database so these tests don't depend on Balla's CRM-8.
function makeLead(ownerId: string, status: 'NEW' | 'QUALIFIED' = 'QUALIFIED') {
  const id = unique();
  return prisma.lead.create({
    data: {
      name: `Lead ${id}`,
      email: `lead${id}@example.com`,
      phone: '9000000000',
      status,
      ownerId,
    },
  });
}

describe('Convert lead (CRM-13)', () => {
  let rep: { headers: Record<string, string>; userId: string };
  let rep2: { headers: Record<string, string>; userId: string };

  beforeAll(async () => {
    rep = await login('rep@crm.test');
    rep2 = await login('rep2@crm.test');
  });

  afterAll(() => prisma.$disconnect());

  it('TC-CONV-05 converts a qualified lead into contact, account and deal', async () => {
    const lead = await makeLead(rep.userId);
    const accountName = `Converted Co ${unique()}`;

    const res = await request(app)
      .post(`/api/v1/leads/${lead.id}/convert`)
      .set(rep.headers)
      .send({ accountName, createDeal: true, dealTitle: 'First order', dealValue: 50000 });

    expect(res.status).toBe(201);
    const { contactId, accountId, dealId } = res.body;
    expect(contactId && accountId && dealId).toBeTruthy();

    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    expect(contact?.email).toBe(lead.email.toLowerCase());
    expect(contact?.accountId).toBe(accountId);

    expect((await prisma.account.findUnique({ where: { id: accountId } }))?.name).toBe(accountName);
    expect((await prisma.deal.findUnique({ where: { id: dealId } }))?.stage).toBe('PROSPECTING');

    const after = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(after?.status).toBe('CONVERTED');
    expect(after?.convertedContactId).toBe(contactId);
  });

  it('TC-CONV-06 rolls everything back if a step fails', async () => {
    const lead = await makeLead(rep.userId);
    const accountName = `Rollback Co ${unique()}`;

    const res = await request(app)
      .post(`/api/v1/leads/${lead.id}/convert`)
      .set(rep.headers)
      .send({ accountName, createDeal: true, dealValue: -1 });

    expect(res.status).toBe(400);
    expect(await prisma.account.count({ where: { name: accountName } })).toBe(0);
    expect(await prisma.contact.count({ where: { email: lead.email.toLowerCase() } })).toBe(0);
    const after = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(after?.status).toBe('QUALIFIED');
    expect(after?.convertedContactId).toBeNull();
  });

  it('works without a deal and with an existing account', async () => {
    const lead = await makeLead(rep.userId);
    const account = await prisma.account.create({ data: { name: `Existing ${unique()}` } });

    const res = await request(app)
      .post(`/api/v1/leads/${lead.id}/convert`)
      .set(rep.headers)
      .send({ accountId: account.id, createDeal: false });

    expect(res.status).toBe(201);
    expect(res.body.accountId).toBe(account.id);
    expect(res.body.dealId).toBeNull();
  });

  it('reuses an existing contact with the same email', async () => {
    const lead = await makeLead(rep.userId);
    const existing = await request(app)
      .post('/api/v1/contacts')
      .set(rep.headers)
      .send({ name: 'Already Here', email: lead.email });

    const res = await request(app)
      .post(`/api/v1/leads/${lead.id}/convert`)
      .set(rep.headers)
      .send({ accountName: `Reuse ${unique()}` });

    expect(res.status).toBe(201);
    expect(res.body.contactId).toBe(existing.body.id);
  });

  it('returns 409 for a lead that is not qualified, or already converted', async () => {
    const fresh = await makeLead(rep.userId, 'NEW');
    const notQualified = await request(app)
      .post(`/api/v1/leads/${fresh.id}/convert`)
      .set(rep.headers)
      .send({ accountName: 'X' });
    expect(notQualified.status).toBe(409);

    const lead = await makeLead(rep.userId);
    const body = { accountName: `Twice ${unique()}` };
    expect(
      (await request(app).post(`/api/v1/leads/${lead.id}/convert`).set(rep.headers).send(body))
        .status,
    ).toBe(201);
    expect(
      (await request(app).post(`/api/v1/leads/${lead.id}/convert`).set(rep.headers).send(body))
        .status,
    ).toBe(409);
  });

  it("returns 403 when a rep converts another rep's lead", async () => {
    const lead = await makeLead(rep.userId);
    const res = await request(app)
      .post(`/api/v1/leads/${lead.id}/convert`)
      .set(rep2.headers)
      .send({ accountName: 'Not mine' });
    expect(res.status).toBe(403);
  });

  it('returns 404 for an unknown lead and 400 with no account', async () => {
    expect(
      (
        await request(app)
          .post('/api/v1/leads/nope/convert')
          .set(rep.headers)
          .send({ accountName: 'X' })
      ).status,
    ).toBe(404);
    const lead = await makeLead(rep.userId);
    expect(
      (await request(app).post(`/api/v1/leads/${lead.id}/convert`).set(rep.headers).send({}))
        .status,
    ).toBe(400);
  });
});
