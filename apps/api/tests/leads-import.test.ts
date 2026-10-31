import type { Role, User } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/common/prisma';
import { authHeader } from './helpers';

const DOMAIN = '@import-test.invalid';
const app = createApp();

let manager: User;
let marketing: User;
let admin: User;
let rep: User;
let support: User;

const makeUser = (role: Role, tag: string) =>
  prisma.user.create({
    data: {
      email: `${tag}${DOMAIN}`,
      passwordHash: 'not-a-real-hash',
      name: `Import ${tag}`,
      role,
    },
  });

const clearLeadsAndContacts = async () => {
  await prisma.lead.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await prisma.contact.deleteMany({ where: { email: { endsWith: DOMAIN } } });
};

beforeAll(async () => {
  await clearLeadsAndContacts();
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  manager = await makeUser('SALES_MANAGER', 'manager');
  marketing = await makeUser('MARKETING', 'marketing');
  admin = await makeUser('ADMIN', 'admin');
  rep = await makeUser('SALES_REP', 'rep');
  support = await makeUser('SUPPORT', 'support');
});

beforeEach(clearLeadsAndContacts);

afterAll(async () => {
  await clearLeadsAndContacts();
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await prisma.$disconnect();
});

const importAs = (user: User, rows: unknown) =>
  request(app).post('/api/v1/leads/import').set(authHeader(user)).send({ rows });

const row = (n: number, extra: object = {}) => ({
  name: `Import Person ${n}`,
  email: `person${n}${DOMAIN}`,
  ...extra,
});

const storedLeads = () => prisma.lead.findMany({ where: { email: { endsWith: DOMAIN } } });

describe('POST /api/v1/leads/import', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app)
      .post('/api/v1/leads/import')
      .send({ rows: [row(1)] });
    expect(res.status).toBe(401);
  });

  it('refuses a Sales Rep and Support with 403 and saves nothing', async () => {
    const asRep = await importAs(rep, [row(1)]);
    const asSupport = await importAs(support, [row(1)]);
    expect(asRep.status).toBe(403);
    expect(asSupport.status).toBe(403);
    expect(await storedLeads()).toHaveLength(0);
  });

  it('lets Admin, Marketing and Sales Manager import', async () => {
    for (const [i, user] of [admin, marketing, manager].entries()) {
      const res = await importAs(user, [row(i + 1)]);
      expect(res.status).toBe(200);
      expect(res.body.imported).toBe(1);
    }
  });

  it('TC-ACQ-03 imports valid rows as unassigned IMPORT leads with emails lower-cased', async () => {
    const res = await importAs(manager, [
      row(1),
      row(2, { phone: '+91 98765 43210', company: 'Sharma Traders' }),
      { name: ' Upper Case ', email: `UPPER${DOMAIN.toUpperCase()}` },
    ]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: 3, imported: 3, duplicates: 0, rejected: 0, errors: [] });

    const leads = await storedLeads();
    expect(leads).toHaveLength(3);
    for (const lead of leads) {
      expect(lead.source).toBe('IMPORT');
      expect(lead.status).toBe('NEW');
      expect(lead.ownerId).toBeNull();
      expect(lead.isDuplicate).toBe(false);
    }
    expect(leads.find((l) => l.name === 'Upper Case')?.email).toBe(`upper${DOMAIN}`);
    expect(leads.find((l) => l.name === 'Import Person 2')?.company).toBe('Sharma Traders');
  });

  it('TC-ACQ-03 flags duplicates of an earlier row in the file and of an existing contact', async () => {
    await prisma.contact.create({
      data: {
        name: 'Existing Customer',
        email: `customer${DOMAIN}`,
        referralCode: 'IMPORT-TEST-REF',
      },
    });
    const res = await importAs(manager, [
      row(1),
      { name: 'Same Person', email: `PERSON1${DOMAIN}` },
      { name: 'Customer Again', email: `customer${DOMAIN}` },
      row(4),
    ]);
    expect(res.body).toMatchObject({ received: 4, imported: 4, duplicates: 2, rejected: 0 });

    const leads = await storedLeads();
    const flagged = (name: string) => leads.find((l) => l.name === name)?.isDuplicate;
    expect(flagged('Import Person 1')).toBe(false);
    expect(flagged('Same Person')).toBe(true);
    expect(flagged('Customer Again')).toBe(true);
    expect(flagged('Import Person 4')).toBe(false);
  });

  it('rejects bad rows with a reason and still imports the good ones', async () => {
    const res = await importAs(manager, [
      row(1),
      { name: 'Bad Email', email: 'not-an-email' },
      { email: `noname${DOMAIN}` },
      { name: 'Bad Phone', email: `phone${DOMAIN}`, phone: 'abc' },
      row(5),
    ]);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: 5, imported: 2, duplicates: 0, rejected: 3 });
    expect(res.body.errors).toEqual([
      { row: 2, email: 'not-an-email', reason: 'Enter a valid email' },
      { row: 3, email: `noname${DOMAIN}`, reason: 'Name is required' },
      { row: 4, email: `phone${DOMAIN}`, reason: 'Enter a valid phone number' },
    ]);
    expect(await storedLeads()).toHaveLength(2);
  });

  it('treats an empty phone or company cell as not provided', async () => {
    const res = await importAs(manager, [row(1, { phone: '', company: '' })]);
    expect(res.body.imported).toBe(1);
    const [lead] = await storedLeads();
    expect(lead?.phone).toBeNull();
    expect(lead?.company).toBeNull();
  });

  it('returns 400 for no rows, a missing rows field or rows that are not objects', async () => {
    const empty = await importAs(manager, []);
    const missing = await request(app)
      .post('/api/v1/leads/import')
      .set(authHeader(manager))
      .send({});
    const notObjects = await importAs(manager, ['just text']);
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe('VALIDATION_ERROR');
    expect(missing.status).toBe(400);
    expect(notObjects.status).toBe(400);
  });

  it('returns 400 for more than 1,000 rows and saves none of them', async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => row(i + 1));
    const res = await importAs(manager, rows);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await storedLeads()).toHaveLength(0);
  });
});
