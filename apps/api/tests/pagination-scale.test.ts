// CRM-32 TC-PERF-03 (CRM-NF-008): with 10,000 extra contacts, asking for 500 rows returns
// at most 100, in under 500 ms. Timed over several requests after a warm-up, worst one counts.
import type { User } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/common/prisma';
import { authHeader } from './helpers';

const app = createApp();
const DOMAIN = '@scale-test.invalid';
const TAG = `SC${Date.now()}`;
const COUNT = 10_000;
const LIMIT_MS = 500;
let admin: User;

jest.setTimeout(120_000);

beforeAll(async () => {
  admin = await prisma.user.create({
    data: { email: `admin-${TAG}${DOMAIN}`, passwordHash: 'x', name: 'Scale admin', role: 'ADMIN' },
  });
  // Insert in chunks so one statement does not get too big.
  for (let start = 0; start < COUNT; start += 2_000) {
    await prisma.contact.createMany({
      data: Array.from({ length: 2_000 }, (_, k) => {
        const i = start + k;
        return {
          name: `${TAG} Contact ${String(i).padStart(5, '0')}`,
          email: `c${i}-${TAG}${DOMAIN}`.toLowerCase(),
          referralCode: `${TAG}${i}`,
          city: ['Pune', 'Delhi', 'Chennai'][i % 3],
        };
      }),
    });
  }
});

afterAll(async () => {
  await prisma.contact.deleteMany({
    where: { email: { endsWith: `${TAG}${DOMAIN}`.toLowerCase() } },
  });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await prisma.$disconnect();
});

async function worstOf(runs: number, path: string, query: Record<string, string>) {
  const get = () => request(app).get(path).query(query).set(authHeader(admin));
  await get(); // warm-up (connection pool, query plan)
  let worst = 0;
  let last: request.Response | undefined;
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    last = await get();
    worst = Math.max(worst, performance.now() - t0);
  }
  return { worst, res: last! };
}

describe('TC-PERF-03 pagination at scale (CRM-NF-008)', () => {
  it('caps a 500-row request at 100 rows and answers in under 500 ms', async () => {
    const { worst, res } = await worstOf(5, '/api/v1/contacts', { pageSize: '500' });

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(100);
    expect(res.body.pageSize).toBe(100);
    expect(res.body.total).toBeGreaterThanOrEqual(COUNT);
    console.log(`TC-PERF-03 contacts pageSize=500: worst ${Math.round(worst)} ms of 5`);
    expect(worst).toBeLessThan(LIMIT_MS);
  });

  it('stays under 500 ms for a deep page and a search', async () => {
    const deep = await worstOf(3, '/api/v1/contacts', { page: '90', pageSize: '100' });
    const search = await worstOf(3, '/api/v1/contacts', {
      q: `${TAG} Contact 09`,
      pageSize: '100',
    });

    expect(deep.res.body.items).toHaveLength(100);
    expect(search.res.body.total).toBe(1_000);
    console.log(
      `TC-PERF-03 deep page: ${Math.round(deep.worst)} ms, search: ${Math.round(search.worst)} ms`,
    );
    expect(deep.worst).toBeLessThan(LIMIT_MS);
    expect(search.worst).toBeLessThan(LIMIT_MS);
  });
});
