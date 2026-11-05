import type { Role, User } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/common/prisma';
import {
  logNotificationService,
  setNotificationService,
  type NotificationService,
} from '../src/modules/reach/notification.service';
import { authHeader } from './helpers';

const DOMAIN = '@metrics-test.invalid';
// A city no seed contact uses, so the audience is exactly the contacts made here.
const CITY = 'Metricsville';
const app = createApp();

let admin: User;
let marketing: User;
let rep: User;
let segmentId: string;
let emptySegmentId: string;
const sentTo: string[][] = [];

const makeUser = (role: Role, tag: string) =>
  prisma.user.create({
    data: { email: `${tag}${DOMAIN}`, passwordHash: 'x', name: `Metrics ${tag}`, role },
  });

const makeCampaign = (name: string, data: { segmentId?: string | null; budget?: number } = {}) =>
  prisma.campaign.create({
    data: {
      name: `MetTest ${name}`,
      channel: 'EMAIL',
      budget: data.budget ?? 7000,
      startDate: new Date('2026-11-01'),
      endDate: new Date('2026-11-30'),
      segmentId: data.segmentId === undefined ? segmentId : data.segmentId,
    },
  });

async function cleanup() {
  const where = { campaign: { name: { startsWith: 'MetTest' } } };
  await prisma.campaignEvent.deleteMany({ where });
  await prisma.lead.deleteMany({ where });
  await prisma.campaign.deleteMany({ where: { name: { startsWith: 'MetTest' } } });
  await prisma.segment.deleteMany({ where: { name: { startsWith: 'MetTest' } } });
  await prisma.contact.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
}

const recorder: NotificationService = {
  async sendCampaign(input) {
    sentTo.push(input.contactIds);
    return logNotificationService.sendCampaign(input);
  },
};

beforeAll(async () => {
  await cleanup();
  admin = await makeUser('ADMIN', 'admin');
  marketing = await makeUser('MARKETING', 'marketing');
  rep = await makeUser('SALES_REP', 'rep');

  // 7 contacts who agreed to marketing, 2 who did not.
  for (let i = 1; i <= 9; i++) {
    await prisma.contact.create({
      data: {
        name: `Met Contact ${i}`,
        email: `c${i}${DOMAIN}`,
        referralCode: `METTEST${i}`,
        marketingConsent: i <= 7,
        city: CITY,
      },
    });
  }
  segmentId = (
    await prisma.segment.create({ data: { name: 'MetTest city', filterJson: { cities: [CITY] } } })
  ).id;
  emptySegmentId = (
    await prisma.segment.create({
      data: { name: 'MetTest nobody', filterJson: { cities: ['Nowhere-at-all'] } },
    })
  ).id;
  setNotificationService(recorder);
});

afterAll(async () => {
  setNotificationService(logNotificationService);
  await cleanup();
  await prisma.$disconnect();
});

const send = (id: string, user: User = marketing) =>
  request(app).post(`/api/v1/campaigns/${id}/send`).set(authHeader(user));
const metrics = (id: string, user: User = marketing) =>
  request(app).get(`/api/v1/campaigns/${id}/metrics`).set(authHeader(user));
const simulate = (id: string, body: object, user: User = marketing) =>
  request(app).post(`/api/v1/campaigns/${id}/simulate-engagement`).set(authHeader(user)).send(body);

describe('CRM-19 campaign sends and metrics', () => {
  it('TC-REACH-04 send to 7, 4 opens, 2 clicks, 1 lead shows 7/4/2/1 and cost per lead', async () => {
    const campaign = await makeCampaign('Diwali');

    const sent = await send(campaign.id);
    expect(sent.status).toBe(200);
    expect(sent.body).toEqual({ sent: 7, status: 'RUNNING' });
    // Only the 7 consenting contacts went to the notification service.
    expect(sentTo.at(-1)).toHaveLength(7);

    const sim = await simulate(campaign.id, { opens: 4, clicks: 2 });
    expect(sim.status).toBe(200);

    await prisma.lead.create({
      data: { name: 'From campaign', email: `lead1${DOMAIN}`, campaignId: campaign.id },
    });

    const res = await metrics(campaign.id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'RUNNING',
      recipients: 7,
      opens: 4,
      clicks: 2,
      leads: 1,
      openRate: 57.1,
      clickRate: 28.6,
      budget: 7000,
      costPerLead: 7000,
    });
    expect(res.body.sentAt).toBeTruthy();
  });

  it('shows zeros and no cost per lead before anything happens', async () => {
    const campaign = await makeCampaign('Untouched');
    const res = await metrics(campaign.id, admin);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'DRAFT',
      sentAt: null,
      recipients: 0,
      opens: 0,
      clicks: 0,
      leads: 0,
      openRate: 0,
      clickRate: 0,
      costPerLead: null,
    });
  });

  it('cannot send the same campaign twice', async () => {
    const campaign = await makeCampaign('Twice');
    expect((await send(campaign.id)).status).toBe(200);
    const again = await send(campaign.id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('CAMPAIGN_NOT_SENDABLE');
    expect(await prisma.campaignEvent.count({ where: { campaignId: campaign.id } })).toBe(7);
  });

  it('needs a segment with someone in it', async () => {
    const noSegment = await makeCampaign('No segment', { segmentId: null });
    const res = await send(noSegment.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_SEGMENT');

    const empty = await makeCampaign('Empty', { segmentId: emptySegmentId });
    const res2 = await send(empty.id);
    expect(res2.status).toBe(409);
    expect(res2.body.error.code).toBe('EMPTY_AUDIENCE');
    // Nothing changed.
    expect((await prisma.campaign.findUnique({ where: { id: empty.id } }))?.status).toBe('DRAFT');
  });

  it('cannot send an archived campaign', async () => {
    const campaign = await makeCampaign('Archived');
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'ARCHIVED' } });
    expect((await send(campaign.id)).status).toBe(409);
  });

  it('simulated engagement only goes up and stays within the recipients', async () => {
    const campaign = await makeCampaign('Simulate');
    // Not sent yet.
    expect((await simulate(campaign.id, { opens: 1, clicks: 0 })).status).toBe(409);
    await send(campaign.id);

    expect((await simulate(campaign.id, { opens: 2, clicks: 3 })).status).toBe(400);
    expect((await simulate(campaign.id, { opens: 8, clicks: 0 })).status).toBe(400);

    expect((await simulate(campaign.id, { opens: 3, clicks: 1 })).body).toMatchObject({
      opens: 3,
      clicks: 1,
    });
    // Running it again with the same numbers adds nothing.
    expect((await simulate(campaign.id, { opens: 3, clicks: 1 })).body).toMatchObject({
      opens: 3,
      clicks: 1,
    });
    expect((await simulate(campaign.id, { opens: 7, clicks: 7 })).body).toMatchObject({
      opens: 7,
      clicks: 7,
      openRate: 100,
    });
    const lower = await simulate(campaign.id, { opens: 2, clicks: 0 });
    expect(lower.status).toBe(409);
    expect(lower.body.error.code).toBe('CANNOT_REDUCE');
  });

  it('completes a running campaign, and only a running one', async () => {
    const campaign = await makeCampaign('Complete');
    const url = `/api/v1/campaigns/${campaign.id}/complete`;
    expect((await request(app).post(url).set(authHeader(marketing))).status).toBe(409);
    await send(campaign.id);
    const done = await request(app).post(url).set(authHeader(marketing));
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('COMPLETED');
    // Engagement can still be recorded after it ends.
    expect((await simulate(campaign.id, { opens: 1, clicks: 0 })).status).toBe(200);
    expect((await request(app).post(url).set(authHeader(marketing))).status).toBe(409);
  });

  it('TC-SEC-03 a Sales Rep cannot send or see campaign results', async () => {
    const campaign = await makeCampaign('Forbidden');
    expect((await send(campaign.id, rep)).status).toBe(403);
    expect((await metrics(campaign.id, rep)).status).toBe(403);
    expect((await request(app).get(`/api/v1/campaigns/${campaign.id}/metrics`)).status).toBe(401);
  });

  it('404 for an unknown campaign and 400 for a bad id', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    expect((await metrics(missing)).status).toBe(404);
    expect((await send(missing)).status).toBe(404);
    expect((await metrics('not-a-uuid')).status).toBe(400);
  });
});
