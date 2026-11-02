// CRM-31 tests: TC-ANA-05 (editing a deal creates an audit entry with user, entity and time),
// create/delete entries, secret redaction, Admin-only access and filters.
import type { Contact, Role, User } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { diff, sanitize } from '../src/common/audit';
import { prisma } from '../src/common/prisma';
import { authHeader } from './helpers';

const app = createApp();
const DOMAIN = '@audit-test.invalid';
const TAG = `AT${Date.now()}`;
const users: Partial<Record<Role, User>> = {};
let contact: Contact;

interface Entry {
  action: string;
  entity: string;
  entityId: string;
  userId: string | null;
  userName: string | null;
  at: string;
  details: Record<string, unknown>;
}

const logsFor = async (query: Record<string, string>) => {
  const res = await request(app)
    .get('/api/v1/audit-logs')
    .query({ pageSize: '100', ...query })
    .set(authHeader(users.ADMIN!));
  expect(res.status).toBe(200);
  return res.body.data as Entry[];
};

const newDeal = async (title: string) =>
  (
    await request(app)
      .post('/api/v1/deals')
      .set(authHeader(users.SALES_MANAGER!))
      .send({ title, value: 1000, contactId: contact.id })
  ).body as { id: string };

beforeAll(async () => {
  for (const role of ['ADMIN', 'SALES_MANAGER', 'SUPPORT'] as Role[]) {
    // Set up outside a request, so these inserts are not audited.
    users[role] = await prisma.user.create({
      data: {
        email: `${role.toLowerCase()}-${TAG}${DOMAIN}`,
        passwordHash: 'x',
        name: `Audit ${role}`,
        role,
      },
    });
  }
  contact = await prisma.contact.create({
    data: { name: `${TAG} Buyer`, email: `buyer-${TAG}${DOMAIN}`, referralCode: TAG },
  });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: {
      OR: [{ userId: { in: Object.values(users).map((u) => u!.id) } }, { entityId: contact.id }],
    },
  });
  await prisma.deal.deleteMany({ where: { contactId: contact.id } });
  await prisma.contact.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await prisma.$disconnect();
});

describe('Audit log (CRM-31)', () => {
  it('TC-ANA-05 editing a deal creates an audit entry with user, entity and time', async () => {
    const deal = await newDeal(`${TAG} Pilot`);
    const before = Date.now();

    const res = await request(app)
      .patch(`/api/v1/deals/${deal.id}`)
      .set(authHeader(users.SALES_MANAGER!))
      .send({ title: `${TAG} Pilot (renewed)` });
    expect(res.status).toBe(200);

    const entries = await logsFor({ entity: 'Deal', entityId: deal.id, action: 'UPDATE' });
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry.userId).toBe(users.SALES_MANAGER!.id);
    expect(entry.userName).toBe('Audit SALES_MANAGER');
    expect(Date.parse(entry.at)).toBeGreaterThanOrEqual(before - 1000);
    expect(entry.details).toEqual({
      changes: { title: { from: `${TAG} Pilot`, to: `${TAG} Pilot (renewed)` } },
    });
  });

  it('records creating a deal with the new values', async () => {
    const deal = await newDeal(`${TAG} Bulk order`);
    const [entry] = await logsFor({ entity: 'Deal', entityId: deal.id, action: 'CREATE' });

    expect(entry.userId).toBe(users.SALES_MANAGER!.id);
    expect(entry.details.after).toMatchObject({ id: deal.id, title: `${TAG} Bulk order` });
  });

  it('records moving a deal to another stage', async () => {
    const deal = await newDeal(`${TAG} Stage move`);
    await request(app)
      .patch(`/api/v1/deals/${deal.id}/stage`)
      .set(authHeader(users.SALES_MANAGER!))
      .send({ stage: 'QUALIFIED' });

    const [entry] = await logsFor({ entity: 'Deal', entityId: deal.id, action: 'UPDATE' });
    expect(entry.details).toEqual({ changes: { stage: { from: 'PROSPECTING', to: 'QUALIFIED' } } });
  });

  it('does not log an update that changes nothing', async () => {
    const deal = await newDeal(`${TAG} Same`);
    await request(app)
      .patch(`/api/v1/deals/${deal.id}`)
      .set(authHeader(users.SALES_MANAGER!))
      .send({ title: `${TAG} Same` });

    expect(await logsFor({ entity: 'Deal', entityId: deal.id, action: 'UPDATE' })).toEqual([]);
  });

  it('records deleting a contact with what it looked like', async () => {
    const created = await request(app)
      .post('/api/v1/contacts')
      .set(authHeader(users.ADMIN!))
      .send({ name: `${TAG} Temp`, email: `temp-${TAG}${DOMAIN}` });
    const id = created.body.id as string;
    const del = await request(app).delete(`/api/v1/contacts/${id}`).set(authHeader(users.ADMIN!));
    expect(del.status).toBeLessThan(300);

    const [entry] = await logsFor({ entity: 'Contact', entityId: id, action: 'DELETE' });
    expect(entry.userId).toBe(users.ADMIN!.id);
    expect(entry.details.before).toMatchObject({ id, name: `${TAG} Temp` });
  });

  it('never stores a password hash', async () => {
    const created = await request(app)
      .post('/api/v1/users')
      .set(authHeader(users.ADMIN!))
      .send({
        name: 'Audit New',
        email: `new-${TAG}${DOMAIN}`,
        role: 'SUPPORT',
        password: 'Secret123',
      });
    expect(created.status).toBe(201);

    const [entry] = await logsFor({ entity: 'User', entityId: created.body.id, action: 'CREATE' });
    // users.service never returns the hash; if a query ever did, the hook would redact it.
    expect([undefined, '[redacted]']).toContain(
      (entry.details.after as Record<string, unknown>).passwordHash,
    );
    expect(JSON.stringify(entry)).not.toContain('$2');
  });

  it('does not log changes made outside an API request (seed, scripts)', async () => {
    const deal = await prisma.deal.create({
      data: {
        title: `${TAG} Script`,
        value: 1,
        contactId: contact.id,
        ownerId: users.SALES_MANAGER!.id,
      },
    });
    expect(await logsFor({ entityId: deal.id })).toEqual([]);
  });

  it('filters by user and date range', async () => {
    const mine = await logsFor({ userId: users.SALES_MANAGER!.id });
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((e) => e.userId === users.SALES_MANAGER!.id)).toBe(true);

    const today = new Date().toISOString().slice(0, 10);
    expect(
      (await logsFor({ userId: users.SALES_MANAGER!.id, from: today, to: today })).length,
    ).toBe(mine.length);
    expect(await logsFor({ userId: users.SALES_MANAGER!.id, to: '2001-01-01' })).toEqual([]);
  });

  it('is Admin only', async () => {
    for (const role of ['SALES_MANAGER', 'SUPPORT'] as Role[]) {
      const res = await request(app).get('/api/v1/audit-logs').set(authHeader(users[role]!));
      expect(res.status).toBe(403);
    }
    expect((await request(app).get('/api/v1/audit-logs')).status).toBe(401);
  });

  it('returns 400 for an unknown entity', async () => {
    const res = await request(app)
      .get('/api/v1/audit-logs')
      .query({ entity: 'PasswordVault' })
      .set(authHeader(users.ADMIN!));
    expect(res.status).toBe(400);
  });
});

describe('Audit helpers (CRM-31)', () => {
  it('diff lists only changed fields and ignores updatedAt', () => {
    expect(
      diff(
        { id: '1', title: 'A', value: 5, updatedAt: new Date(1) },
        { id: '1', title: 'B', value: 5, updatedAt: new Date(2) },
      ),
    ).toEqual({ title: { from: 'A', to: 'B' } });
  });

  it('sanitize redacts secrets at any depth and turns dates into strings', () => {
    expect(
      sanitize({
        passwordHash: 'h',
        nested: { apiToken: 't' },
        at: new Date('2026-11-02T00:00:00Z'),
      }),
    ).toEqual({
      passwordHash: '[redacted]',
      nested: { apiToken: '[redacted]' },
      at: '2026-11-02T00:00:00.000Z',
    });
  });
});
