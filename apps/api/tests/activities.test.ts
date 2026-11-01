import { randomUUID } from 'node:crypto';
import type { Contact, Deal, Lead, Role, User } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/common/prisma';
import { authHeader } from './helpers';

const DOMAIN = '@activities-test.invalid';
const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY).toISOString();
const app = createApp();

let rep: User;
let otherRep: User;
let manager: User;
let contact: Contact;
let lead: Lead;
let repDeal: Deal;
let otherDeal: Deal;

const makeUser = (role: Role, tag: string) =>
  prisma.user.create({
    data: { email: `${tag}${DOMAIN}`, passwordHash: 'not-a-real-hash', name: `Act ${tag}`, role },
  });

async function cleanup() {
  await prisma.activity.deleteMany({ where: { user: { email: { endsWith: DOMAIN } } } });
  await prisma.deal.deleteMany({ where: { owner: { email: { endsWith: DOMAIN } } } });
  await prisma.lead.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await prisma.contact.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
}

beforeAll(async () => {
  await cleanup();
  rep = await makeUser('SALES_REP', 'rep');
  otherRep = await makeUser('SALES_REP', 'otherrep');
  manager = await makeUser('SALES_MANAGER', 'manager');
  contact = await prisma.contact.create({
    data: { name: 'Act Test Contact', email: `contact${DOMAIN}`, referralCode: 'ACT-TEST-REF' },
  });
  lead = await prisma.lead.create({
    data: { name: 'Act Test Lead', email: `lead${DOMAIN}`, ownerId: rep.id },
  });
  repDeal = await prisma.deal.create({
    data: { title: 'Rep deal', value: 1000, contactId: contact.id, ownerId: rep.id },
  });
  otherDeal = await prisma.deal.create({
    data: { title: 'Other deal', value: 2000, contactId: contact.id, ownerId: otherRep.id },
  });
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const post = (user: User, body: object) =>
  request(app).post('/api/v1/activities').set(authHeader(user)).send(body);

const list = (user: User, query: string) =>
  request(app).get(`/api/v1/activities?${query}`).set(authHeader(user));

const patch = (user: User, id: string, body: object) =>
  request(app).patch(`/api/v1/activities/${id}`).set(authHeader(user)).send(body);

const ids = (res: request.Response) => res.body.data.map((a: { id: string }) => a.id);

describe('POST /api/v1/activities', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/v1/activities').send({});
    expect(res.status).toBe(401);
  });

  it('logs a call against a deal', async () => {
    const res = await post(rep, { type: 'CALL', subject: 'Call Asha', dealId: repDeal.id });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      type: 'CALL',
      subject: 'Call Asha',
      dealId: repDeal.id,
      contactId: null,
      leadId: null,
      userId: rep.id,
      done: false,
      overdue: false,
      linkLabel: 'Rep deal',
    });
  });

  it('can be linked to a lead or to a contact', async () => {
    const onLead = await post(rep, { type: 'NOTE', subject: 'Lead note', leadId: lead.id });
    const onContact = await post(rep, { type: 'MEETING', subject: 'Meet', contactId: contact.id });
    expect(onLead.status).toBe(201);
    expect(onLead.body.leadId).toBe(lead.id);
    expect(onContact.status).toBe(201);
    expect(onContact.body.contactId).toBe(contact.id);
  });

  it('requires exactly one link', async () => {
    const none = await post(rep, { type: 'TASK', subject: 'No link' });
    const two = await post(rep, {
      type: 'TASK',
      subject: 'Two links',
      dealId: repDeal.id,
      contactId: contact.id,
    });
    expect(none.status).toBe(400);
    expect(none.body.error.code).toBe('VALIDATION_ERROR');
    expect(two.status).toBe(400);
  });

  it('returns 404 when the linked deal does not exist', async () => {
    const res = await post(rep, { type: 'TASK', subject: 'x', dealId: randomUUID() });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('DEAL_NOT_FOUND');
  });

  it('returns 400 for a bad type or an empty subject', async () => {
    const badType = await post(rep, { type: 'EMAIL', subject: 'x', dealId: repDeal.id });
    const noSubject = await post(rep, { type: 'TASK', subject: '  ', dealId: repDeal.id });
    expect(badType.status).toBe(400);
    expect(noSubject.status).toBe(400);
  });

  it('TC-CONV-07 a task due yesterday is overdue; a future task or a note is not', async () => {
    const late = await post(rep, {
      type: 'TASK',
      subject: 'Late',
      dueAt: daysFromNow(-1),
      dealId: repDeal.id,
    });
    const later = await post(rep, {
      type: 'TASK',
      subject: 'Later',
      dueAt: daysFromNow(1),
      dealId: repDeal.id,
    });
    const note = await post(rep, { type: 'NOTE', subject: 'No date', dealId: repDeal.id });
    expect(late.body.overdue).toBe(true);
    expect(later.body.overdue).toBe(false);
    expect(note.body.overdue).toBe(false);
  });
});

describe('GET /api/v1/activities', () => {
  it('overdue=true returns only open, overdue activities', async () => {
    const late = await post(rep, {
      type: 'TASK',
      subject: 'A',
      dueAt: daysFromNow(-2),
      dealId: repDeal.id,
    });
    const future = await post(rep, {
      type: 'TASK',
      subject: 'B',
      dueAt: daysFromNow(2),
      dealId: repDeal.id,
    });
    const doneLate = await post(rep, {
      type: 'TASK',
      subject: 'C',
      dueAt: daysFromNow(-3),
      dealId: repDeal.id,
    });
    await patch(rep, doneLate.body.id, { done: true });

    const res = await list(rep, `overdue=true&dealId=${repDeal.id}&pageSize=100`);
    expect(res.status).toBe(200);
    expect(ids(res)).toContain(late.body.id);
    expect(ids(res)).not.toContain(future.body.id);
    expect(ids(res)).not.toContain(doneLate.body.id);
    expect(res.body.data.every((a: { overdue: boolean }) => a.overdue)).toBe(true);
  });

  it('overdue=false does not filter (the text "false" is not treated as true)', async () => {
    const late = await post(rep, {
      type: 'TASK',
      subject: 'L',
      dueAt: daysFromNow(-1),
      dealId: repDeal.id,
    });
    const future = await post(rep, {
      type: 'TASK',
      subject: 'F',
      dueAt: daysFromNow(1),
      dealId: repDeal.id,
    });
    const res = await list(rep, `overdue=false&dealId=${repDeal.id}&pageSize=100`);
    expect(ids(res)).toEqual(expect.arrayContaining([late.body.id, future.body.id]));
  });

  it('filters by dealId', async () => {
    const onDeal = await post(rep, { type: 'CALL', subject: 'On deal', dealId: repDeal.id });
    const onLead = await post(rep, { type: 'CALL', subject: 'On lead', leadId: lead.id });
    const res = await list(rep, `dealId=${repDeal.id}&pageSize=100`);
    expect(ids(res)).toContain(onDeal.body.id);
    expect(ids(res)).not.toContain(onLead.body.id);
  });

  it('mine=true returns only what the caller logged', async () => {
    const byManager = await post(manager, {
      type: 'NOTE',
      subject: 'From manager',
      dealId: repDeal.id,
    });
    const byRep = await post(rep, { type: 'NOTE', subject: 'From rep', dealId: repDeal.id });

    const mine = await list(rep, `dealId=${repDeal.id}&mine=true&pageSize=100`);
    expect(ids(mine)).toContain(byRep.body.id);
    expect(ids(mine)).not.toContain(byManager.body.id);

    // The rep owns the deal, so without mine=true they also see the manager's note.
    const all = await list(rep, `dealId=${repDeal.id}&pageSize=100`);
    expect(ids(all)).toEqual(expect.arrayContaining([byRep.body.id, byManager.body.id]));
  });

  it('a Sales Rep does not see activities on other reps’ deals; a manager does', async () => {
    const theirs = await post(otherRep, { type: 'NOTE', subject: 'Private', dealId: otherDeal.id });
    const asRep = await list(rep, `dealId=${otherDeal.id}&pageSize=100`);
    const asManager = await list(manager, `dealId=${otherDeal.id}&pageSize=100`);
    expect(ids(asRep)).not.toContain(theirs.body.id);
    expect(ids(asManager)).toContain(theirs.body.id);
  });
});

describe('PATCH /api/v1/activities/:id', () => {
  it('marking done clears the overdue flag and drops it from the overdue list', async () => {
    const created = await post(rep, {
      type: 'TASK',
      subject: 'Finish',
      dueAt: daysFromNow(-1),
      dealId: repDeal.id,
    });
    const res = await patch(rep, created.body.id, { done: true });
    expect(res.status).toBe(200);
    expect(res.body.done).toBe(true);
    expect(res.body.overdue).toBe(false);

    const overdue = await list(rep, `overdue=true&dealId=${repDeal.id}&pageSize=100`);
    expect(ids(overdue)).not.toContain(created.body.id);
  });

  it('returns 403 when a rep edits another user’s activity, and 200 for a manager', async () => {
    const theirs = await post(otherRep, { type: 'NOTE', subject: 'Theirs', dealId: otherDeal.id });
    const asRep = await patch(rep, theirs.body.id, { subject: 'Hacked' });
    expect(asRep.status).toBe(403);

    const asManager = await patch(manager, theirs.body.id, { subject: 'Reviewed' });
    expect(asManager.status).toBe(200);
    expect(asManager.body.subject).toBe('Reviewed');
  });

  it('returns 400 for an empty change or a bad id, and 404 for an unknown activity', async () => {
    const created = await post(rep, { type: 'NOTE', subject: 'Edit me', dealId: repDeal.id });
    const empty = await patch(rep, created.body.id, {});
    const badId = await patch(rep, 'not-an-id', { done: true });
    const missing = await patch(rep, randomUUID(), { done: true });
    expect(empty.status).toBe(400);
    expect(badId.status).toBe(400);
    expect(missing.status).toBe(404);
  });
});
