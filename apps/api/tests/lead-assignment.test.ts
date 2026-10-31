// CRM-10 (CRM-F-023) tests: TC-ACQ-05, TC-ACQ-06.
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/common/prisma';
import { roundRobin } from '../src/modules/acquire/lead-assignment.service';

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

describe('Lead assignment (CRM-10)', () => {
  let manager: Awaited<ReturnType<typeof login>>;
  let rep: Awaited<ReturnType<typeof login>>;
  let rep2: Awaited<ReturnType<typeof login>>;
  const created: string[] = [];

  // Leads start owned by the manager so this works whether ownerId is optional or not.
  async function makeLeads(n: number) {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const id = unique();
      const lead = await prisma.lead.create({
        data: { name: `Assign ${id}`, email: `assign${id}@example.com`, ownerId: manager.userId },
      });
      ids.push(lead.id);
    }
    created.push(...ids);
    return ids;
  }

  beforeAll(async () => {
    manager = await login('manager@crm.test');
    rep = await login('rep@crm.test');
    rep2 = await login('rep2@crm.test');
  });

  afterAll(async () => {
    await prisma.lead.deleteMany({ where: { id: { in: created } } });
    await prisma.$disconnect();
  });

  it('TC-ACQ-05 round-robin splits 6 leads over 3 reps as 2 each', () => {
    const plan = roundRobin(['l1', 'l2', 'l3', 'l4', 'l5', 'l6'], ['a', 'b', 'c']);
    expect([...plan.values()].map((ids) => ids.length)).toEqual([2, 2, 2]);
  });

  it('TC-ACQ-05 round-robin through the API gives every rep an equal share', async () => {
    const repIds = [rep.userId, rep2.userId];
    const leadIds = await makeLeads(repIds.length * 2);

    const res = await request(app)
      .post('/api/v1/leads/assign/round-robin')
      .set(manager.headers)
      .send({ leadIds, repIds });

    expect(res.status).toBe(200);
    expect(res.body.assigned).toBe(leadIds.length);
    for (const repId of repIds) {
      expect(await prisma.lead.count({ where: { id: { in: leadIds }, ownerId: repId } })).toBe(2);
    }
  });

  it('assigns one lead manually', async () => {
    const [leadId] = await makeLeads(1);
    const res = await request(app)
      .patch(`/api/v1/leads/${leadId}/assign`)
      .set(manager.headers)
      .send({ ownerId: rep2.userId });
    expect(res.status).toBe(200);
    expect(res.body.ownerId).toBe(rep2.userId);
  });

  it('TC-ACQ-06 a sales rep cannot assign leads', async () => {
    const [leadId] = await makeLeads(1);
    const one = await request(app)
      .patch(`/api/v1/leads/${leadId}/assign`)
      .set(rep.headers)
      .send({ ownerId: rep.userId });
    expect(one.status).toBe(403);
    const many = await request(app)
      .post('/api/v1/leads/assign/round-robin')
      .set(rep.headers)
      .send({ leadIds: [leadId] });
    expect(many.status).toBe(403);
    expect((await prisma.lead.findUnique({ where: { id: leadId } }))?.ownerId).toBe(manager.userId);
  });

  it('rejects assigning to someone who is not an active sales rep', async () => {
    const [leadId] = await makeLeads(1);
    const res = await request(app)
      .patch(`/api/v1/leads/${leadId}/assign`)
      .set(manager.headers)
      .send({ ownerId: manager.userId });
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown leads', async () => {
    const one = await request(app)
      .patch('/api/v1/leads/nope/assign')
      .set(manager.headers)
      .send({ ownerId: rep.userId });
    expect(one.status).toBe(404);
    const many = await request(app)
      .post('/api/v1/leads/assign/round-robin')
      .set(manager.headers)
      .send({ leadIds: ['nope'] });
    expect(many.status).toBe(404);
  });
});
