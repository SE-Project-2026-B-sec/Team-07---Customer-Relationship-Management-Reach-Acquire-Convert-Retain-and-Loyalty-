// CRM-6 (CRM-F-003) tests: TC-AUTH-04 and the admin rules.
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/common/prisma';

const app = createApp();
const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const PASSWORD = 'Welcome123';

async function login(email: string, password = 'Password@123') {
  return request(app).post('/api/v1/auth/login').send({ email, password });
}

describe('User admin (CRM-6)', () => {
  let admin: { headers: Record<string, string>; userId: string };
  let rep: Record<string, string>;
  const createdEmails: string[] = [];

  async function createUser(role = 'SALES_REP') {
    const email = `staff${unique()}@example.com`;
    createdEmails.push(email);
    return request(app)
      .post('/api/v1/users')
      .set(admin.headers)
      .send({ name: 'New Staff', email, role, password: PASSWORD });
  }

  beforeAll(async () => {
    const a = await login('admin@crm.test');
    admin = { headers: { Authorization: `Bearer ${a.body.token}` }, userId: a.body.user.id };
    rep = { Authorization: `Bearer ${(await login('rep@crm.test')).body.token}` };
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await prisma.$disconnect();
  });

  it('TC-AUTH-04 a deactivated user cannot log in', async () => {
    const created = await createUser();
    expect(created.status).toBe(201);
    expect(created.body.passwordHash).toBeUndefined();

    expect((await login(created.body.email, PASSWORD)).status).toBe(200);

    const off = await request(app)
      .patch(`/api/v1/users/${created.body.id}`)
      .set(admin.headers)
      .send({ isActive: false });
    expect(off.status).toBe(200);
    expect(off.body.isActive).toBe(false);

    expect((await login(created.body.email, PASSWORD)).status).toBe(401);

    // Reactivating lets them back in.
    await request(app)
      .patch(`/api/v1/users/${created.body.id}`)
      .set(admin.headers)
      .send({ isActive: true });
    expect((await login(created.body.email, PASSWORD)).status).toBe(200);
  });

  it('changes a user role', async () => {
    const created = await createUser('SALES_REP');
    const res = await request(app)
      .patch(`/api/v1/users/${created.body.id}`)
      .set(admin.headers)
      .send({ role: 'SUPPORT' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('SUPPORT');
  });

  it('lists users without password hashes', async () => {
    const res = await request(app).get('/api/v1/users').set(admin.headers);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].passwordHash).toBeUndefined();
  });

  it('returns 409 for a duplicate email and 400 for a weak password', async () => {
    const created = await createUser();
    const dup = await request(app)
      .post('/api/v1/users')
      .set(admin.headers)
      .send({ name: 'Dup', email: created.body.email, role: 'SUPPORT', password: PASSWORD });
    expect(dup.status).toBe(409);

    const weak = await request(app)
      .post('/api/v1/users')
      .set(admin.headers)
      .send({
        name: 'Weak',
        email: `weak${unique()}@example.com`,
        role: 'SUPPORT',
        password: 'short',
      });
    expect(weak.status).toBe(400);
  });

  it('stops an admin deactivating themselves', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${admin.userId}`)
      .set(admin.headers)
      .send({ isActive: false });
    expect(res.status).toBe(400);
  });

  it('only admins can manage users', async () => {
    expect((await request(app).get('/api/v1/users').set(rep)).status).toBe(403);
    expect((await request(app).get('/api/v1/users')).status).toBe(401);
  });
});
