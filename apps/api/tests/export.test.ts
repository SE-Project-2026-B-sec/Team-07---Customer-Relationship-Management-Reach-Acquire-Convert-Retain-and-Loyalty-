// CRM-29 TC-ANA-03: CSV export row count equals the list total; same filters and role rules.
import type { Role, User } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/common/prisma';
import { toCsv } from '../src/modules/analytics/csv';
import { authHeader } from './helpers';

const app = createApp();
const DOMAIN = '@export-test.invalid';
const TAG = `xt${Date.now()}`;
const users: Partial<Record<Role, User>> = {};

const makeUser = (role: Role, n = '') =>
  prisma.user.create({
    data: {
      email: `${role.toLowerCase()}${n}-${TAG}${DOMAIN}`,
      passwordHash: 'x',
      name: `Export ${role}`,
      role,
    },
  });

let otherRep: User;

beforeAll(async () => {
  for (const role of ['ADMIN', 'MARKETING', 'SALES_MANAGER', 'SALES_REP', 'SUPPORT'] as Role[]) {
    users[role] = await makeUser(role);
  }
  otherRep = await makeUser('SALES_REP', '2');

  // 105 contacts so the export has to read more than one page of 100.
  await prisma.contact.createMany({
    data: Array.from({ length: 105 }, (_, i) => ({
      name: `${TAG} Contact ${String(i).padStart(3, '0')}`,
      email: `c${i}-${TAG}${DOMAIN}`,
      referralCode: `${TAG}${i}`,
      ownerId: i < 3 ? users.SALES_REP!.id : otherRep.id,
      // A value that would run as a formula in Excel if it were not escaped.
      city: i === 0 ? '=HYPERLINK("http://evil")' : 'Pune, Maharashtra',
    })),
  });
  await prisma.lead.createMany({
    data: [
      { name: `${TAG} Lead A`, email: `la-${TAG}${DOMAIN}`, status: 'NEW' },
      { name: `${TAG} Lead B`, email: `lb-${TAG}${DOMAIN}`, status: 'QUALIFIED' },
    ],
  });
});

afterAll(async () => {
  await prisma.lead.deleteMany({ where: { email: { endsWith: `${TAG}${DOMAIN}` } } });
  await prisma.contact.deleteMany({ where: { email: { endsWith: `${TAG}${DOMAIN}` } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await prisma.$disconnect();
});

const exportCsv = (role: Role, name: string, query: Record<string, string> = {}) =>
  request(app).get(`/api/v1/reports/${name}/export.csv`).query(query).set(authHeader(users[role]!));

/** Data lines in a CSV body (without the header and the final empty line). */
const dataLines = (csv: string) => csv.trimEnd().split('\r\n').slice(1);

describe('CSV export (CRM-29)', () => {
  it('TC-ANA-03 exported contact rows equal the contact list total', async () => {
    const list = await request(app)
      .get('/api/v1/contacts')
      .query({ q: TAG })
      .set(authHeader(users.ADMIN!));
    const res = await exportCsv('ADMIN', 'contacts', { q: TAG });

    expect(list.body.total).toBe(105);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="contacts-.*\.csv"/);
    expect(res.headers['x-total-count']).toBe('105');
    expect(dataLines(res.text)).toHaveLength(list.body.total);
    expect(res.text.split('\r\n')[0]).toBe(
      'Name,Email,Phone,City,Account,Tier,Marketing consent,Tags,Created',
    );
  });

  it('quotes commas and blocks spreadsheet formulas', async () => {
    const res = await exportCsv('ADMIN', 'contacts', { q: `${TAG} Contact 00` });
    expect(res.text).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(res.text).toContain('"Pune, Maharashtra"');
  });

  it('a Sales Rep exports only their own contacts', async () => {
    const res = await exportCsv('SALES_REP', 'contacts', { q: TAG });
    expect(dataLines(res.text)).toHaveLength(3);
  });

  it('applies the list filters (leads by status)', async () => {
    const all = await exportCsv('MARKETING', 'leads', { q: TAG });
    const qualified = await exportCsv('MARKETING', 'leads', { q: TAG, status: 'QUALIFIED' });
    expect(dataLines(all.text)).toHaveLength(2);
    expect(dataLines(qualified.text)).toHaveLength(1);
    expect(qualified.text).toContain(`${TAG} Lead B`);
  });

  it('exports deals, tickets and the funnel for roles that can see them', async () => {
    expect((await exportCsv('SALES_MANAGER', 'deals')).status).toBe(200);
    expect((await exportCsv('SUPPORT', 'tickets')).status).toBe(200);
    const funnel = await exportCsv('MARKETING', 'funnel', {
      from: '2001-01-01',
      to: '2001-01-31',
    });
    expect(funnel.status).toBe(200);
    expect(dataLines(funnel.text)).toHaveLength(5);
    expect(funnel.text).toContain('Repeat customers,0,,');
  });

  it('refuses roles that cannot see the list', async () => {
    expect((await exportCsv('MARKETING', 'tickets')).status).toBe(403);
    expect((await exportCsv('SUPPORT', 'leads')).status).toBe(403);
    expect((await exportCsv('SUPPORT', 'deals')).status).toBe(403);
    expect((await exportCsv('SALES_REP', 'funnel')).status).toBe(403);
  });

  it('returns 400 for an unknown export or bad filter, 401 without a token', async () => {
    expect((await exportCsv('ADMIN', 'users')).status).toBe(400);
    expect((await exportCsv('ADMIN', 'leads', { status: 'MAYBE' })).status).toBe(400);
    expect((await request(app).get('/api/v1/reports/leads/export.csv')).status).toBe(401);
  });
});

describe('CSV writer (CRM-29)', () => {
  const cols = [
    { header: 'Text', value: (r: { t: unknown }) => r.t },
    { header: 'N', value: () => -5 },
  ];

  it('writes CRLF lines, empty cells for null, and escapes quotes', () => {
    expect(toCsv(cols, [{ t: null }, { t: 'say "hi"' }, { t: 'a\nb' }])).toBe(
      'Text,N\r\n,-5\r\n"say ""hi""",-5\r\n"a\nb",-5\r\n',
    );
  });

  it('prefixes formula-like text but keeps negative numbers', () => {
    expect(toCsv(cols, [{ t: '+91 98' }, { t: '@cmd' }])).toBe(
      "Text,N\r\n'+91 98,-5\r\n'@cmd,-5\r\n",
    );
  });
});
