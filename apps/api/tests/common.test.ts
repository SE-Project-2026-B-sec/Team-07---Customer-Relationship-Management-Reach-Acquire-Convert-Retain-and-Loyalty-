import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { loadConfig } from '../src/common/config';
import { AppError, errorHandler } from '../src/common/errors';
import { paged, paginationQuery, toSkipTake } from '../src/common/pagination';
import { validate } from '../src/common/validate';

describe('pagination', () => {
  it('defaults to page 1 of 20', () => {
    expect(paginationQuery.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('caps pageSize at 100 (CRM-NF-008)', () => {
    expect(paginationQuery.parse({ pageSize: '500' }).pageSize).toBe(100);
  });

  it('converts to skip/take and wraps results', () => {
    const p = { page: 3, pageSize: 10 };
    expect(toSkipTake(p)).toEqual({ skip: 20, take: 10 });
    expect(paged(['a'], 21, p)).toEqual({ data: ['a'], page: 3, pageSize: 10, total: 21 });
  });
});

describe('validate middleware and error handler', () => {
  const app = express();
  app.use(express.json());
  app.post('/echo', validate(z.object({ name: z.string().min(1) })), (req, res) => {
    res.json(req.body);
  });
  app.get('/conflict', () => {
    throw new AppError(409, 'CONFLICT', 'Already exists');
  });
  app.get('/boom', () => {
    throw new Error('unexpected');
  });
  app.use(errorHandler);

  it('passes valid input through', async () => {
    const res = await request(app).post('/echo').send({ name: 'Priya' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: 'Priya' });
  });

  it('rejects invalid input with VALIDATION_ERROR', async () => {
    const res = await request(app).post('/echo').send({ name: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('maps AppError to its status and code', async () => {
    const res = await request(app).get('/conflict');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'CONFLICT', message: 'Already exists' });
  });

  it('hides unexpected errors behind a generic 500', async () => {
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe('Something went wrong');
  });
});

describe('config', () => {
  it('loads valid settings with defaults', () => {
    const cfg = loadConfig({ DATABASE_URL: 'postgresql://x', JWT_SECRET: 'a'.repeat(32) });
    expect(cfg.PORT).toBe(4000);
    expect(cfg.JWT_EXPIRES_IN).toBe('60m');
  });

  it('refuses a short JWT secret', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgresql://x', JWT_SECRET: 'short' })).toThrow(
      /JWT_SECRET/,
    );
  });
});
