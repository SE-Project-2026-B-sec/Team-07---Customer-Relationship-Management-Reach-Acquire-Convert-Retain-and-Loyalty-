import { randomUUID } from 'node:crypto';
import type { Role, User } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/common/prisma';
import { authHeader } from './helpers';

const DOMAIN = '@campaign-test.invalid';
const PREFIX = 'CT ';
const app = createApp();

let marketing: User;
let admin: User;
let manager: User;
let rep: User;
let support: User;

const makeUser = (role: Role, tag: string) =>
    prisma.user.create({
        data: { email: `${tag}${DOMAIN}`, passwordHash: 'not-a-real-hash', name: `Campaign ${tag}`, role },
    });

const clearData = async () => {
    await prisma.campaign.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await prisma.segment.deleteMany({ where: { name: { startsWith: PREFIX } } });
};

beforeAll(async () => {
    await clearData();
    await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
    marketing = await makeUser('MARKETING', 'marketing');
    admin = await makeUser('ADMIN', 'admin');
    manager = await makeUser('SALES_MANAGER', 'manager');
    rep = await makeUser('SALES_REP', 'rep');
    support = await makeUser('SUPPORT', 'support');
});

beforeEach(clearData);

afterAll(async () => {
    await clearData();
    await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
    await prisma.$disconnect();
});

const valid = (extra: object = {}) => ({
    name: `${PREFIX}Diwali push`,
    channel: 'EMAIL',
    budget: 50000,
    startDate: '2026-12-01',
    endDate: '2026-12-31',
    ...extra,
});

const create = (user: User, body: unknown) =>
    request(app).post('/api/v1/campaigns').set(authHeader(user)).send(body as object);
const patch = (user: User, id: string, body: unknown) =>
    request(app).patch(`/api/v1/campaigns/${id}`).set(authHeader(user)).send(body as object);
const stored = () => prisma.campaign.findMany({ where: { name: { startsWith: PREFIX } } });

describe('Campaigns API (CRM-18)', () => {
    it('returns 401 without a token', async () => {
        const res = await request(app).get('/api/v1/campaigns');
        expect(res.status).toBe(401);
    });

    it('refuses Sales Manager, Sales Rep and Support with 403', async () => {
        for (const user of [manager, rep, support]) {
            const list = await request(app).get('/api/v1/campaigns').set(authHeader(user));
            const made = await create(user, valid());
            expect(list.status).toBe(403);
            expect(made.status).toBe(403);
        }
        expect(await stored()).toHaveLength(0);
    });

    it('TC-REACH-01 saves a valid campaign as Scheduled', async () => {
        const res = await create(marketing, valid());
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({
            name: `${PREFIX}Diwali push`,
            channel: 'EMAIL',
            budget: 50000,
            status: 'SCHEDULED',
            segmentId: null,
        });
        const [row] = await stored();
        expect(row?.status).toBe('SCHEDULED');
        expect(row?.startDate.toISOString().slice(0, 10)).toBe('2026-12-01');

        const asAdmin = await create(admin, valid({ name: `${PREFIX}Admin made` }));
        expect(asAdmin.status).toBe(201);
    });

    it('saves a draft when asked to', async () => {
        const res = await create(marketing, valid({ status: 'DRAFT' }));
        expect(res.status).toBe(201);
        expect(res.body.status).toBe('DRAFT');
    });

    it('TC-REACH-02 rejects an end date before the start date and saves nothing', async () => {
        const res = await create(marketing, valid({ startDate: '2026-12-31', endDate: '2026-12-01' }));
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        expect(JSON.stringify(res.body)).toContain('End date must be on or after the start date');
        expect(await stored()).toHaveLength(0);
    });

    it('allows a one-day campaign (start and end on the same day)', async () => {
        const res = await create(marketing, valid({ startDate: '2026-12-05', endDate: '2026-12-05' }));
        expect(res.status).toBe(201);
    });

    it('TC-REACH-02 rejects missing or invalid dates', async () => {
        const noDates = await create(marketing, { name: `${PREFIX}x`, channel: 'EMAIL', budget: 1 });
        const text = await create(marketing, valid({ startDate: 'tomorrow-ish' }));
        const nul = await create(marketing, valid({ endDate: null }));
        expect([noDates.status, text.status, nul.status]).toEqual([400, 400, 400]);
        expect(await stored()).toHaveLength(0);
    });

    it('rejects an empty name, a negative budget and an unknown channel', async () => {
        const noName = await create(marketing, valid({ name: '  ' }));
        const negative = await create(marketing, valid({ budget: -5 }));
        const badChannel = await create(marketing, valid({ channel: 'FAX' }));
        expect([noName.status, negative.status, badChannel.status]).toEqual([400, 400, 400]);
        expect(await stored()).toHaveLength(0);
    });

    it('links a segment that exists and rejects one that does not', async () => {
        const segment = await prisma.segment.create({
            data: { name: `${PREFIX}VIP`, filterJson: { tier: 'GOLD' } },
        });
        const ok = await create(marketing, valid({ segmentId: segment.id }));
        expect(ok.status).toBe(201);
        expect(ok.body.segmentId).toBe(segment.id);
        expect(ok.body.segmentName).toBe(`${PREFIX}VIP`);

        const missing = await create(marketing, valid({ segmentId: randomUUID() }));
        expect(missing.status).toBe(404);
        expect(missing.body.error.code).toBe('SEGMENT_NOT_FOUND');
    });

    it('gets one campaign, 404 for an unknown id and 400 for a bad id', async () => {
        const made = await create(marketing, valid());
        const found = await request(app)
            .get(`/api/v1/campaigns/${made.body.id}`)
            .set(authHeader(marketing));
        const unknown = await request(app)
            .get(`/api/v1/campaigns/${randomUUID()}`)
            .set(authHeader(marketing));
        const badId = await request(app).get('/api/v1/campaigns/not-an-id').set(authHeader(marketing));
        expect(found.status).toBe(200);
        expect(found.body.id).toBe(made.body.id);
        expect(unknown.status).toBe(404);
        expect(badId.status).toBe(400);
    });

    it('edits a campaign', async () => {
        const made = await create(marketing, valid());
        const res = await patch(marketing, made.body.id, {
            name: `${PREFIX}Renamed`,
            budget: 75000.5,
            channel: 'SMS',
        });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ name: `${PREFIX}Renamed`, budget: 75000.5, channel: 'SMS' });
        expect(res.body.status).toBe('SCHEDULED');
    });

    it('TC-REACH-02 rejects an edit that makes the end date earlier than the saved start date', async () => {
        const made = await create(marketing, valid());
        const onlyEnd = await patch(marketing, made.body.id, { endDate: '2026-11-15' });
        const onlyStart = await patch(marketing, made.body.id, { startDate: '2027-02-01' });
        expect(onlyEnd.status).toBe(400);
        expect(onlyStart.status).toBe(400);
        const [row] = await stored();
        expect(row?.endDate.toISOString().slice(0, 10)).toBe('2026-12-31');
    });

    it('can archive a campaign, clear its segment, and refuses an empty edit', async () => {
        const segment = await prisma.segment.create({ data: { name: `${PREFIX}Seg`, filterJson: {} } });
        const made = await create(marketing, valid({ segmentId: segment.id }));
        const cleared = await patch(marketing, made.body.id, { segmentId: null });
        expect(cleared.body.segmentId).toBeNull();
        const empty = await patch(marketing, made.body.id, {});
        expect(empty.status).toBe(400);
        const archived = await patch(marketing, made.body.id, { status: 'ARCHIVED' });
        expect(archived.body.status).toBe('ARCHIVED');
    });

    it('locks running campaigns with 409 and 404s an unknown id', async () => {
        const running = await prisma.campaign.create({
            data: {
                name: `${PREFIX}Live`,
                channel: 'EMAIL',
                budget: 1000,
                status: 'RUNNING',
                startDate: new Date('2026-11-01'),
                endDate: new Date('2026-11-30'),
            },
        });
        const locked = await patch(marketing, running.id, { name: `${PREFIX}Changed` });
        expect(locked.status).toBe(409);
        expect(locked.body.error.code).toBe('CAMPAIGN_LOCKED');
        const unknown = await patch(marketing, randomUUID(), { name: `${PREFIX}Nope` });
        expect(unknown.status).toBe(404);
    });

    it('lists campaigns, newest start date first, with a status filter', async () => {
        await create(marketing, valid({ name: `${PREFIX}A`, startDate: '2026-12-01', endDate: '2026-12-02' }));
        await create(marketing, valid({ name: `${PREFIX}B`, startDate: '2027-01-01', endDate: '2027-01-02' }));
        await create(
            marketing,
            valid({ name: `${PREFIX}C`, status: 'DRAFT', startDate: '2026-11-01', endDate: '2026-11-02' }),
        );

        const all = await request(app)
            .get('/api/v1/campaigns?pageSize=100')
            .set(authHeader(marketing));
        const mine = all.body.data.filter((c: { name: string }) => c.name.startsWith(PREFIX));
        expect(mine.map((c: { name: string }) => c.name)).toEqual([
            `${PREFIX}B`,
            `${PREFIX}A`,
            `${PREFIX}C`,
        ]);

        const drafts = await request(app)
            .get('/api/v1/campaigns?status=DRAFT&pageSize=100')
            .set(authHeader(marketing));
        const draftNames = drafts.body.data
            .filter((c: { name: string }) => c.name.startsWith(PREFIX))
            .map((c: { name: string }) => c.name);
        expect(draftNames).toEqual([`${PREFIX}C`]);
    });
});