import request from 'supertest';

jest.mock('../src/common/prisma', () => ({
  prisma: { $queryRaw: jest.fn() },
}));

import { createApp } from '../src/app';
import { prisma } from '../src/common/prisma';

const queryRaw = prisma.$queryRaw as unknown as jest.Mock;

describe('GET /api/v1/health', () => {
  it('returns ok when the database responds', async () => {
    queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    const res = await request(createApp()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'ok' });
  });

  it('returns 503 when the database is unreachable', async () => {
    queryRaw.mockRejectedValueOnce(new Error('connection refused'));
    const res = await request(createApp()).get('/api/v1/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('error');
  });
});

describe('unknown routes and security headers', () => {
  it('returns the standard 404 error shape', async () => {
    const res = await request(createApp()).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('sets helmet headers and hides Express', async () => {
    queryRaw.mockResolvedValueOnce([]);
    const res = await request(createApp()).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
