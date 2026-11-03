// CRM-32 security checks that were not already covered elsewhere:
//   TC-SEC-01 HSTS header        (redirect HTTP -> HTTPS is checked on the deployed site, see docs)
//   TC-SEC-02 no secrets in logs (bcrypt storage is in auth.test.ts)
//   TC-SEC-05 malformed / injection-style input gets a clean 4xx, never a 500 or a data leak
//   TC-SEC-07 a contact's data can be exported and erased on request (consent is in segments.test)
// Already covered: TC-SEC-03 auth.test.ts, TC-SEC-04 route-guard.test.ts, TC-SEC-06 leads.test.ts.
import { Writable } from 'node:stream';
import type { Contact, Role, User } from '@prisma/client';
import pino from 'pino';
import request from 'supertest';
import { createApp } from '../src/app';
import { LOG_REDACT } from '../src/common/logger';
import { prisma } from '../src/common/prisma';
import { authHeader } from './helpers';

const app = createApp();
const DOMAIN = '@security-test.invalid';
const TAG = `SE${Date.now()}`;
const users: Partial<Record<Role, User>> = {};
let contact: Contact;

beforeAll(async () => {
  for (const role of ['ADMIN', 'SUPPORT'] as Role[]) {
    users[role] = await prisma.user.create({
      data: { email: `${role.toLowerCase()}-${TAG}${DOMAIN}`, passwordHash: 'x', name: role, role },
    });
  }
  contact = await prisma.contact.create({
    data: { name: `${TAG} Person`, email: `person-${TAG}${DOMAIN}`, referralCode: TAG },
  });
});

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { contactId: contact.id } });
  await prisma.deal.deleteMany({ where: { contactId: contact.id } });
  await prisma.contact.deleteMany({
    where: { OR: [{ id: contact.id }, { email: { endsWith: DOMAIN } }] },
  });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [{ userId: { in: Object.values(users).map((u) => u!.id) } }, { entityId: contact.id }],
    },
  });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await prisma.$disconnect();
});

describe('TC-SEC-01 transport security headers', () => {
  it('sends HSTS for at least a year, including subdomains', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    const hsts = res.headers['strict-transport-security'];
    expect(hsts).toMatch(/max-age=(\d+)/);
    expect(Number(hsts.match(/max-age=(\d+)/)?.[1])).toBeGreaterThanOrEqual(31_536_000);
    expect(hsts).toContain('includeSubDomains');
  });
});

describe('TC-SEC-02 secrets never reach the logs', () => {
  it('redacts the Authorization header, cookies and passwords', () => {
    let out = '';
    const sink = new Writable({
      write(chunk, _enc, done) {
        out += chunk.toString();
        done();
      },
    });
    const log = pino({ redact: LOG_REDACT }, sink);
    log.info({
      req: { headers: { authorization: 'Bearer secret-token-123', cookie: 'sid=abc' } },
      body: { email: 'a@b.c', password: 'Hunter2!' },
      user: { passwordHash: '$2b$10$abcdef' },
    });

    expect(out).not.toContain('secret-token-123');
    expect(out).not.toContain('sid=abc');
    expect(out).not.toContain('Hunter2!');
    expect(out).not.toContain('$2b$10$');
    expect(out).toContain('[Redacted]');
  });
});

describe('TC-SEC-05 malformed and injection-style input', () => {
  const admin = () => authHeader(users.ADMIN!);

  it('treats SQL-like search text as plain text', async () => {
    const res = await request(app)
      .get('/api/v1/contacts')
      .query({ q: '\' OR 1=1; DROP TABLE "Contact"; --' })
      .set(admin());
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(await prisma.contact.count()).toBeGreaterThan(0); // table still there
  });

  it('rejects a non-UUID id with 400, not a database error', async () => {
    const res = await request(app).get('/api/v1/tickets/1%20OR%201=1').set(admin());
    expect(res.status).toBe(400);
  });

  it('rejects an object where a string is expected (NoSQL-style login)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: { $gt: '' }, password: { $gt: '' } });
    expect(res.status).toBe(400);
  });

  it('answers malformed JSON with 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "a@b.c", ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBeDefined();
  });

  it('answers a body over 1 MB with 413', async () => {
    const res = await request(app)
      .post('/api/v1/public/leads')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ name: 'x'.repeat(1_100_000), email: 'big@example.com' }));
    expect(res.status).toBe(413);
  });

  it('stores script tags as text and returns them as JSON, not HTML', async () => {
    const res = await request(app)
      .post('/api/v1/contacts')
      .set(admin())
      .send({ name: `<script>alert(1)</script>${TAG}`, email: `xss-${TAG}${DOMAIN}` });
    expect(res.status).toBe(201);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.name).toBe(`<script>alert(1)</script>${TAG}`);
  });
});

describe('TC-SEC-07 data rights (DPDP Act 2023)', () => {
  it('exports everything held about a contact', async () => {
    await request(app)
      .post('/api/v1/tickets')
      .set(authHeader(users.SUPPORT!))
      .send({ subject: `${TAG} help`, description: 'x', priority: 'LOW', contactId: contact.id });

    const res = await request(app)
      .get(`/api/v1/customers/${contact.id}/360`)
      .set(authHeader(users.ADMIN!));
    expect(res.status).toBe(200);
    expect(res.body.profile.email).toBe(contact.email);
    expect(JSON.stringify(res.body)).toContain(`${TAG} help`);
  });

  it('erases a contact on request but keeps their ticket (anonymised, D-5 fix)', async () => {
    const email = contact.email;
    // The contact came from a lead, which also holds their details.
    const lead = await prisma.lead.create({
      data: {
        name: contact.name,
        email,
        phone: '+91 90000 00000',
        status: 'CONVERTED',
        convertedContactId: contact.id,
      },
    });
    // An edit made through the API, so the audit log holds the old details.
    await request(app)
      .patch(`/api/v1/contacts/${contact.id}`)
      .set(authHeader(users.ADMIN!))
      .send({ phone: '+91 98765 43210' });

    const res = await request(app)
      .delete(`/api/v1/contacts/${contact.id}`)
      .set(authHeader(users.ADMIN!));
    expect(res.status).toBe(204);

    // Personal data is gone from the contact and the lead...
    const after = await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
    expect(after).toMatchObject({ name: 'Deleted customer', phone: null, marketingConsent: false });
    expect(after.email).not.toBe(email);
    const leadAfter = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(leadAfter).toMatchObject({ name: 'Deleted customer', phone: null });
    // ...and from the audit history, which records only that it was erased and by whom.
    const audit = await prisma.auditLog.findMany({
      where: { entityId: { in: [contact.id, lead.id] } },
    });
    expect(JSON.stringify(audit)).not.toContain(email);
    expect(JSON.stringify(audit)).not.toContain('98765');
    expect(audit.some((a) => a.action === 'DELETE' && a.userId === users.ADMIN!.id)).toBe(true);

    // The business record stays and still points at the (now anonymous) customer.
    const ticket = await prisma.ticket.findFirstOrThrow({ where: { contactId: contact.id } });
    expect(ticket.subject).toBe(`${TAG} help`);
    await prisma.lead.delete({ where: { id: lead.id } });
  });

  it('still deletes a contact with no history outright', async () => {
    const created = await request(app)
      .post('/api/v1/contacts')
      .set(authHeader(users.ADMIN!))
      .send({ name: `${TAG} Fresh`, email: `fresh-${TAG}${DOMAIN}` });
    const res = await request(app)
      .delete(`/api/v1/contacts/${created.body.id}`)
      .set(authHeader(users.ADMIN!));
    expect(res.status).toBe(204);
    expect(await prisma.contact.findUnique({ where: { id: created.body.id } })).toBeNull();
  });
});
