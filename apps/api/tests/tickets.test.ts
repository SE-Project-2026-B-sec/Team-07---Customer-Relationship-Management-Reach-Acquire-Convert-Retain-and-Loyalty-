// CRM-21 integration tests: TC-RET-01 (Urgent ticket gets the SLA due time and shows as breached
// once overdue), role checks, validation, status/priority rules and list filters.
import type { Contact, Role, User } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/common/prisma';
import { authHeader } from './helpers';

const app = createApp();
const PREFIX = `TT${Date.now()} `;
const HOUR = 3_600_000;
// Own email domain, so other test files' user cleanup never removes these users mid-run.
const DOMAIN = '@ticket-test.invalid';

let admin: User;
let support: User;
let manager: User;
let rep: User;
let marketing: User;
let contact: Contact;

const create = (user: User, body: object) =>
  request(app).post('/api/v1/tickets').set(authHeader(user)).send(body);
const patch = (user: User, id: string, body: object) =>
  request(app).patch(`/api/v1/tickets/${id}`).set(authHeader(user)).send(body);
const list = (user: User, query: Record<string, string> = {}) =>
  request(app)
    .get('/api/v1/tickets')
    .query({ q: PREFIX.trim(), pageSize: '100', ...query })
    .set(authHeader(user));

const valid = (extra: object = {}) => ({
  subject: `${PREFIX}Order not delivered`,
  description: 'Customer called about a late order.',
  priority: 'URGENT',
  contactId: contact.id,
  ...extra,
});

/** Inserts a ticket directly, for states the API cannot produce on demand (e.g. raised hours ago). */
const insertTicket = (extra: { status?: 'OPEN' | 'RESOLVED'; slaDueAt: Date; subject: string }) =>
  prisma.ticket.create({
    data: {
      subject: `${PREFIX}${extra.subject}`,
      description: 'Inserted by test',
      priority: 'URGENT',
      status: extra.status ?? 'OPEN',
      slaDueAt: extra.slaDueAt,
      contactId: contact.id,
    },
  });

// Inserted directly (no password hashing): these users only ever call the API with a token.
const makeUser = (role: Role) =>
  prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${Date.now()}${DOMAIN}`,
      passwordHash: 'not-a-real-hash',
      name: `Ticket ${role}`,
      role,
    },
  });

beforeAll(async () => {
  [admin, support, manager, rep, marketing] = await Promise.all(
    (['ADMIN', 'SUPPORT', 'SALES_MANAGER', 'SALES_REP', 'MARKETING'] as Role[]).map(makeUser),
  );
  contact = await prisma.contact.create({
    data: {
      name: `${PREFIX}Customer`,
      email: `customer-${Date.now()}${DOMAIN}`,
      referralCode: `TT${Date.now().toString(36)}`,
    },
  });
});

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { subject: { startsWith: PREFIX } } });
  await prisma.contact.deleteMany({ where: { id: contact.id } });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await prisma.$disconnect();
});

describe('Tickets API (CRM-21)', () => {
  it('TC-RET-01 an Urgent ticket gets an SLA due time 4 hours after it is raised', async () => {
    const before = Date.now();
    const res = await create(support, valid());

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('OPEN');
    expect(res.body.breached).toBe(false);
    const created = new Date(res.body.createdAt).getTime();
    expect(created).toBeGreaterThanOrEqual(before - 1000);
    expect(new Date(res.body.slaDueAt).getTime()).toBe(created + 4 * HOUR);
  });

  it('TC-RET-01 an overdue open ticket is returned as breached', async () => {
    const overdue = await insertTicket({
      subject: 'Overdue',
      slaDueAt: new Date(Date.now() - HOUR),
    });

    const res = await request(app).get(`/api/v1/tickets/${overdue.id}`).set(authHeader(support));
    expect(res.status).toBe(200);
    expect(res.body.breached).toBe(true);
  });

  it('a Support agent who raises a ticket is its assignee by default', async () => {
    const res = await create(support, valid({ priority: 'LOW' }));
    expect(res.body.assigneeId).toBe(support.id);
    expect(res.body.contactName).toBe(`${PREFIX}Customer`);
  });

  it('returns 401 without a token', async () => {
    expect((await request(app).get('/api/v1/tickets')).status).toBe(401);
  });

  it('lets Sales Manager read but not create tickets', async () => {
    expect((await list(manager)).status).toBe(200);
    expect((await create(manager, valid())).status).toBe(403);
  });

  it('refuses Sales Rep and Marketing with 403', async () => {
    for (const user of [rep, marketing]) {
      expect((await list(user)).status).toBe(403);
      expect((await create(user, valid())).status).toBe(403);
    }
  });

  it('returns 400 for a missing subject or an unknown priority', async () => {
    expect((await create(support, valid({ subject: '  ' }))).status).toBe(400);
    expect((await create(support, valid({ priority: 'CRITICAL' }))).status).toBe(400);
  });

  it('returns 404 for an unknown contact', async () => {
    const res = await create(support, valid({ contactId: '00000000-0000-4000-8000-000000000000' }));
    expect(res.status).toBe(404);
  });

  it('refuses to assign a ticket to a Sales Rep', async () => {
    const res = await create(support, valid({ assigneeId: rep.id }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ASSIGNEE');
  });

  it('changing priority recalculates the SLA due time from when the ticket was raised', async () => {
    const { body: ticket } = await create(support, valid({ priority: 'URGENT' }));
    const res = await patch(support, ticket.id, { priority: 'LOW' });

    expect(res.status).toBe(200);
    expect(new Date(res.body.slaDueAt).getTime()).toBe(
      new Date(ticket.createdAt).getTime() + 72 * HOUR,
    );
  });

  it('resolving stamps resolvedAt and clears breached; reopening clears resolvedAt', async () => {
    const overdue = await insertTicket({
      subject: 'Resolve me',
      slaDueAt: new Date(Date.now() - HOUR),
    });

    const resolved = await patch(admin, overdue.id, { status: 'RESOLVED' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.resolvedAt).not.toBeNull();
    expect(resolved.body.breached).toBe(false);

    const reopened = await patch(admin, overdue.id, { status: 'IN_PROGRESS' });
    expect(reopened.body.resolvedAt).toBeNull();
    expect(reopened.body.breached).toBe(true);
  });

  it('returns 400 for an empty update and 404 for an unknown ticket', async () => {
    const { body: ticket } = await create(support, valid());
    expect((await patch(support, ticket.id, {})).status).toBe(400);
    expect(
      (await patch(support, '00000000-0000-4000-8000-000000000000', { status: 'CLOSED' })).status,
    ).toBe(404);
  });

  it('filters by breached, status and priority', async () => {
    const late = await insertTicket({ subject: 'Late', slaDueAt: new Date(Date.now() - HOUR) });
    const lateButResolved = await insertTicket({
      subject: 'Late but resolved',
      status: 'RESOLVED',
      slaDueAt: new Date(Date.now() - HOUR),
    });

    const breached = await list(support, { breached: 'true' });
    const ids = breached.body.data.map((t: { id: string }) => t.id);
    expect(ids).toContain(late.id);
    expect(ids).not.toContain(lateButResolved.id);
    expect(breached.body.data.every((t: { breached: boolean }) => t.breached)).toBe(true);

    const notBreached = await list(support, { breached: 'false' });
    const notIds = notBreached.body.data.map((t: { id: string }) => t.id);
    expect(notIds).toContain(lateButResolved.id);
    expect(notIds).not.toContain(late.id);

    const resolved = await list(support, { status: 'RESOLVED' });
    expect(resolved.body.data.every((t: { status: string }) => t.status === 'RESOLVED')).toBe(true);

    const low = await list(support, { priority: 'LOW' });
    expect(low.body.data.every((t: { priority: string }) => t.priority === 'LOW')).toBe(true);
  });

  it('lists open tickets before resolved ones, soonest due first', async () => {
    const res = await list(support);
    const rows: { status: string; slaDueAt: string }[] = res.body.data;
    const firstResolved = rows.findIndex((t) => t.status === 'RESOLVED' || t.status === 'CLOSED');
    const open = firstResolved === -1 ? rows : rows.slice(0, firstResolved);
    const due = open.map((t) => new Date(t.slaDueAt).getTime());
    expect(due).toEqual([...due].sort((a, b) => a - b));
  });

  it('lists active Support and Admin users as assignees', async () => {
    const res = await request(app).get('/api/v1/tickets/assignees').set(authHeader(support));
    expect(res.status).toBe(200);
    const ids = res.body.map((u: { id: string }) => u.id);
    expect(ids).toEqual(expect.arrayContaining([support.id, admin.id]));
    expect(ids).not.toContain(rep.id);
  });
});
