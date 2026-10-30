import type { Role } from '@prisma/client';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../src/common/errors';
import {
  ADMIN_ONLY,
  assertCanModify,
  authenticate,
  authorize,
  MANAGERS,
  ownedBy,
  SALES_TEAM,
} from '../src/modules/auth';
import { signToken } from '../src/modules/auth/auth.service';

// A small app with one route per role group, so we can test authorize() without a database.
const app = express();
app.get('/admin-only', authenticate, authorize(...ADMIN_ONLY), (_req, res) => {
  res.json({ ok: true });
});
app.get('/managers', authenticate, authorize(...MANAGERS), (_req, res) => {
  res.json({ ok: true });
});
app.get('/sales', authenticate, authorize(...SALES_TEAM), (_req, res) => {
  res.json({ ok: true });
});
app.get('/no-authenticate', authorize(...ADMIN_ONLY), (_req, res) => {
  res.json({ ok: true });
});
app.use(errorHandler);

const as = (role: Role) => ({
  Authorization: `Bearer ${signToken({ id: `user-${role}`, role })}`,
});

describe('authorize() role checks', () => {
  it('TC-AUTH-03 blocks a Sales Rep from an admin-only route with 403', async () => {
    const res = await request(app).get('/admin-only').set(as('SALES_REP'));
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lets the Admin through', async () => {
    const res = await request(app).get('/admin-only').set(as('ADMIN'));
    expect(res.status).toBe(200);
  });

  it.each<[string, Role, number]>([
    ['/managers', 'SALES_MANAGER', 200],
    ['/managers', 'SALES_REP', 403],
    ['/sales', 'SALES_REP', 200],
    ['/sales', 'MARKETING', 403],
    ['/sales', 'SUPPORT', 403],
  ])('%s as %s returns %i', async (path, role, status) => {
    const res = await request(app).get(path).set(as(role));
    expect(res.status).toBe(status);
  });

  it('returns 401 (not 403) when there is no token', async () => {
    const res = await request(app).get('/admin-only');
    expect(res.status).toBe(401);
  });

  it('returns 401 if authorize() is used without authenticate()', async () => {
    const res = await request(app).get('/no-authenticate').set(as('ADMIN'));
    expect(res.status).toBe(401);
  });
});

describe('ownership helpers', () => {
  const rep = { id: 'rep-1', role: 'SALES_REP' as Role };
  const manager = { id: 'mgr-1', role: 'SALES_MANAGER' as Role };

  it('TC-CONV-02 limits a Sales Rep to their own records', () => {
    expect(ownedBy(rep)).toEqual({ ownerId: 'rep-1' });
  });

  it('does not filter for other roles', () => {
    expect(ownedBy(manager)).toEqual({});
  });

  it("stops a Sales Rep changing someone else's record", () => {
    expect(() => assertCanModify(rep, 'rep-2')).toThrow(
      'You can only change records assigned to you',
    );
    expect(() => assertCanModify(rep, null)).toThrow();
    expect(() => assertCanModify(rep, 'rep-1')).not.toThrow();
  });

  it('lets managers change any record', () => {
    expect(() => assertCanModify(manager, 'rep-2')).not.toThrow();
  });
});
