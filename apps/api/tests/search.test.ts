// apps/api/tests/search.test.ts
import request from 'supertest';
import { app } from '../src/app';
import { createTestUser, deleteTestUsers, authHeader, TEST_PASSWORD } from './helpers';
import { prisma } from '../src/common/prisma';

describe('GET /api/v1/analytics/search', () => {
  let salesRep: any;
  let supportUser: any;

  beforeAll(async () => {
    // create two users with different roles
    salesRep = await createTestUser('SALES_REP');
    supportUser = await createTestUser('SUPPORT');

    // seed some data owned by salesRep
    await prisma.lead.create({
      data: { name: 'Acme Corp', email: 'acme@example.com', ownerId: salesRep.id },
    });
    const contact = await prisma.contact.create({
      data: { name: 'Bob', email: 'bob@example.com', ownerId: salesRep.id, referralCode: 'ref-' + Date.now().toString() },
    });
    // ticket owned by salesRep
    await prisma.ticket.create({
      data: { subject: 'Acme Issue', description: 'test', assigneeId: salesRep.id, contactId: contact.id, slaDueAt: new Date(Date.now() + 7*24*60*60*1000) },
    });
  });

  afterAll(async () => {
    await prisma.lead.deleteMany({});
    await prisma.contact.deleteMany({});
    await prisma.ticket.deleteMany({});
    await deleteTestUsers();
  });

  it('rejects queries shorter than 2 chars', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/search?q=a')
      .set(authHeader(salesRep));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_QUERY');
  });

  it('returns results respecting role ownership', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/search?q=acme')
      .set(authHeader(salesRep));
    expect(res.status).toBe(200);
    // leads should include Acme
    expect(res.body.leads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Acme Corp' }),
      ]),
    );
    // contacts should include Bob (owned by salesRep)
    expect(res.body.contacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Bob' }),
      ]),
    );
    // tickets should include Acme Issue
    expect(res.body.tickets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subject: 'Acme Issue' }),
      ]),
    );
  });

  it('allows SUPPORT role to see all contacts and tickets', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/search?q=acme')
      .set(authHeader(supportUser));
    expect(res.status).toBe(200);
    // support should see the same lead (owned by salesRep) because leads are filtered by ownership, so lead list empty
    expect(res.body.leads.length).toBe(0);
    // contacts should be visible even though owned by salesRep
    expect(res.body.contacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Bob' }),
      ]),
    );
    // tickets also visible
    expect(res.body.tickets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subject: 'Acme Issue' }),
      ]),
    );
  });
});
