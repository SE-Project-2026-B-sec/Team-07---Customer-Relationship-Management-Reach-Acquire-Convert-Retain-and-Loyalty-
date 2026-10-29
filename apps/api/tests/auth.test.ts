import type { User } from '@prisma/client';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/common/prisma';
import { authHeader, createTestUser, deleteTestUsers, TEST_PASSWORD } from './helpers';

// Integration tests: these need the database running (README section 1). CI provides one.
const app = createApp();
let rep: User;
let inactive: User;

beforeAll(async () => {
  rep = await createTestUser('SALES_REP');
  inactive = await createTestUser('SUPPORT', { isActive: false });
});

afterAll(async () => {
  await deleteTestUsers();
  await prisma.$disconnect();
});

describe('POST /api/v1/auth/login', () => {
  it('TC-AUTH-01 logs in with valid credentials and returns a token and the user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: rep.email, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({
      id: rep.id,
      name: rep.name,
      email: rep.email,
      role: 'SALES_REP',
    });
    expect(res.body.user.passwordHash).toBeUndefined();

    const payload = jwt.verify(res.body.token, process.env.JWT_SECRET!) as jwt.JwtPayload;
    expect(payload.sub).toBe(rep.id);
    expect(payload.role).toBe('SALES_REP');
    expect(payload.exp! - payload.iat!).toBe(60 * 60); // CRM-SR-003: 60-minute expiry
  });

  it('accepts the email in any letter case and with spaces', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: `  ${rep.email.toUpperCase()} `, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
  });

  it('TC-AUTH-02 gives the same generic 401 for a wrong password and an unknown email', async () => {
    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: rep.email, password: 'wrong-password' });
    const unknownEmail = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@crm.test', password: TEST_PASSWORD });

    for (const res of [wrongPassword, unknownEmail]) {
      expect(res.status).toBe(401);
      expect(res.body.error).toMatchObject({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
      expect(res.body.token).toBeUndefined();
    }
  });

  it('refuses a deactivated user with the same generic message', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: inactive.email, password: TEST_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('rejects a badly formed request with 400', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('TC-SEC-02 password storage', () => {
  it('stores only a bcrypt hash, never the password', async () => {
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: rep.id } });
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$10\$/);
    expect(stored.passwordHash).not.toContain(TEST_PASSWORD);
  });
});

describe('GET /api/v1/auth/me and TC-SEC-03 token checks', () => {
  it('returns the logged-in user for a valid token', async () => {
    const res = await request(app).get('/api/v1/auth/me').set(authHeader(rep));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: rep.id, name: rep.name, email: rep.email, role: 'SALES_REP' });
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns 401 for an expired token', async () => {
    const expired = jwt.sign({ role: 'SALES_REP' }, process.env.JWT_SECRET!, {
      subject: rep.id,
      expiresIn: -10,
    });
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 for a token signed with a different secret (tampered)', async () => {
    const forged = jwt.sign({ role: 'ADMIN' }, 'some-other-secret-value', { subject: rep.id });
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 if the user was deactivated after logging in', async () => {
    const res = await request(app).get('/api/v1/auth/me').set(authHeader(inactive));
    expect(res.status).toBe(401);
  });
});
