import type { LeadScoreRule, Role, User } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/common/prisma';
import { createLead } from '../src/modules/acquire';
import {
  computeScore,
  readRule,
  type ScoreRule,
  type ScoringInput,
} from '../src/modules/acquire/lead-scoring.rules';
import { authHeader } from './helpers';

const DOMAIN = '@scoring-test.invalid';
const app = createApp();

// The rules these tests use (replaced in beforeAll, original rules put back in afterAll).
const RULES: ScoreRule[] = [
  { field: 'source', match: { equals: 'REFERRAL' }, points: 30, isActive: true },
  { field: 'source', match: { equals: 'WEB' }, points: 15, isActive: true },
  { field: 'phone', match: { present: true }, points: 10, isActive: true },
  { field: 'company', match: { present: true }, points: 15, isActive: true },
  { field: 'campaign', match: { present: true }, points: 10, isActive: true },
  { field: 'activities', match: { min: 2 }, points: 20, isActive: true },
  { field: 'status', match: { equals: 'QUALIFIED' }, points: 25, isActive: true },
];

let originalRules: LeadScoreRule[] = [];
let manager: User;
let rep: User;
let support: User;

const makeUser = (role: Role, tag: string) =>
  prisma.user.create({
    data: { email: `${tag}${DOMAIN}`, passwordHash: 'x', name: `Scoring ${tag}`, role },
  });

const saveRules = (rules: ScoreRule[], user: User = manager) =>
  request(app).put('/api/v1/lead-scoring/rules').set(authHeader(user)).send({ rules });

async function cleanup() {
  await prisma.activity.deleteMany({ where: { lead: { email: { endsWith: DOMAIN } } } });
  await prisma.lead.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
}

beforeAll(async () => {
  await cleanup();
  originalRules = await prisma.leadScoreRule.findMany();
  manager = await makeUser('SALES_MANAGER', 'manager');
  rep = await makeUser('SALES_REP', 'rep');
  support = await makeUser('SUPPORT', 'support');
  expect((await saveRules(RULES)).status).toBe(200);
});

afterAll(async () => {
  await cleanup();
  await prisma.$transaction([
    prisma.leadScoreRule.deleteMany(),
    prisma.leadScoreRule.createMany({
      data: originalRules.map(({ field, matchJson, points, isActive }) => ({
        field,
        matchJson: matchJson ?? {},
        points,
        isActive,
      })),
    }),
  ]);
  await prisma.$disconnect();
});

const base: ScoringInput = {
  source: 'MANUAL',
  status: 'NEW',
  phone: null,
  company: null,
  campaignId: null,
  activityCount: 0,
};

describe('computeScore (CRM-F-022)', () => {
  it('TC-ACQ-04 adds up the points of every matching rule', () => {
    expect(computeScore(base, RULES)).toBe(0);
    expect(computeScore({ ...base, source: 'WEB', phone: '+91 98450 00000' }, RULES)).toBe(25);
    expect(
      computeScore({ ...base, source: 'referral', company: 'Rao Co', activityCount: 2 }, RULES),
    ).toBe(65);
  });

  it('never goes above 100 or below 0', () => {
    const everything = {
      source: 'REFERRAL',
      status: 'QUALIFIED',
      phone: '1234567',
      company: 'X',
      campaignId: 'c1',
      activityCount: 5,
    };
    expect(computeScore(everything, RULES)).toBe(100); // 30+10+15+10+20+25 = 110
    const penalty: ScoreRule = {
      field: 'phone',
      match: { present: true },
      points: -50,
      isActive: true,
    };
    expect(computeScore({ ...base, phone: '1234567' }, [penalty])).toBe(0);
  });

  it('ignores inactive rules, blank values and too few activities', () => {
    const off = RULES.map((r) => ({ ...r, isActive: false }));
    expect(computeScore({ ...base, source: 'REFERRAL' }, off)).toBe(0);
    expect(computeScore({ ...base, phone: '   ', company: '' }, RULES)).toBe(0);
    expect(computeScore({ ...base, activityCount: 1 }, RULES)).toBe(0);
  });

  it('skips stored rules that no longer make sense', () => {
    expect(
      readRule({ field: 'phone', matchJson: { present: true }, points: 5, isActive: true }),
    ).toEqual({ field: 'phone', match: { present: true }, points: 5, isActive: true });
    expect(
      readRule({ field: 'shoeSize', matchJson: { min: 1 }, points: 5, isActive: true }),
    ).toBeNull();
    expect(
      readRule({ field: 'phone', matchJson: { min: 2 }, points: 5, isActive: true }),
    ).toBeNull();
  });
});

describe('scores are kept up to date', () => {
  it('scores a new lead from the website form when it is created', async () => {
    await request(app)
      .post('/api/v1/public/leads')
      .send({ name: 'Web Lead', email: `web${DOMAIN}`, phone: '+91 98450 11111' });
    const lead = await prisma.lead.findFirst({ where: { email: `web${DOMAIN}` } });
    expect(lead?.score).toBe(25); // WEB 15 + phone 10
  });

  it('re-scores a lead when it is edited', async () => {
    const lead = await createLead({ name: 'Edit Me', email: `edit${DOMAIN}`, source: 'MANUAL' });
    expect(lead.score).toBe(0);

    const res = await request(app)
      .patch(`/api/v1/leads/${lead.id}`)
      .set(authHeader(manager))
      .send({ company: 'Iyer Foods', status: 'QUALIFIED' });
    expect(res.status).toBe(200);
    expect(res.body.score).toBe(40); // company 15 + qualified 25
  });

  it('re-scores a lead when activities are logged on it (engagement)', async () => {
    const lead = await createLead({
      name: 'Engaged',
      email: `engaged${DOMAIN}`,
      source: 'MANUAL',
      ownerId: rep.id,
    });
    const log = (subject: string) =>
      request(app)
        .post('/api/v1/activities')
        .set(authHeader(rep))
        .send({ type: 'CALL', subject, leadId: lead.id });

    expect((await log('First call')).status).toBe(201);
    expect((await prisma.lead.findUnique({ where: { id: lead.id } }))?.score).toBe(0);
    expect((await log('Follow-up call')).status).toBe(201);
    expect((await prisma.lead.findUnique({ where: { id: lead.id } }))?.score).toBe(20);
  });
});

describe('scoring rules API', () => {
  it('lets anyone who sees leads read the rules, always in the same order', async () => {
    const res = await request(app).get('/api/v1/lead-scoring/rules').set(authHeader(rep));
    expect(res.status).toBe(200);
    expect(res.body.rules.map((r: ScoreRule) => `${r.field}:${r.points}`)).toEqual([
      'source:30',
      'source:15',
      'status:25',
      'phone:10',
      'company:15',
      'campaign:10',
      'activities:20',
    ]);
  });

  it('re-scores every lead when a manager changes the rules', async () => {
    const lead = await createLead({
      name: 'Referral',
      email: `referral${DOMAIN}`,
      source: 'REFERRAL',
    });
    expect(lead.score).toBe(30);

    const doubled = RULES.map((r) => (r.field === 'source' ? { ...r, points: r.points * 2 } : r));
    const res = await saveRules(doubled);
    expect(res.status).toBe(200);
    expect(res.body.rescored).toBeGreaterThanOrEqual(1);
    expect((await prisma.lead.findUnique({ where: { id: lead.id } }))?.score).toBe(60);

    await saveRules(RULES); // back to normal for the other tests
  });

  it('rejects rules whose match does not fit the field', async () => {
    const bad = await saveRules([
      { field: 'phone', match: { equals: 'yes' }, points: 5, isActive: true } as ScoreRule,
    ]);
    expect(bad.status).toBe(400);
    const tooMany = await saveRules([
      { field: 'source', match: { equals: 'WEB' }, points: 500, isActive: true },
    ]);
    expect(tooMany.status).toBe(400);
  });

  it('lists leads hottest first with sort=score', async () => {
    const res = await request(app)
      .get('/api/v1/leads?sort=score&pageSize=50')
      .set(authHeader(manager));
    expect(res.status).toBe(200);
    const scores: number[] = res.body.data.map((l: { score: number }) => l.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('a manager can re-score all leads on demand', async () => {
    const res = await request(app).post('/api/v1/lead-scoring/rescore').set(authHeader(manager));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('rescored');
  });

  it('only Admin and Sales Manager can change rules or re-score', async () => {
    expect((await saveRules(RULES, rep)).status).toBe(403);
    expect(
      (await request(app).post('/api/v1/lead-scoring/rescore').set(authHeader(rep))).status,
    ).toBe(403);
    expect(
      (await request(app).get('/api/v1/lead-scoring/rules').set(authHeader(support))).status,
    ).toBe(403);
    expect((await request(app).get('/api/v1/lead-scoring/rules')).status).toBe(401);
  });
});
