// CRM-11 (CRM-F-030) tests: TC-CONV-01, TC-CONV-02, duplicate email, page-size cap.
// Needs the database running and seeded (rep@crm.test, rep2@crm.test, support@crm.test).
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();
const PASSWORD = 'Password@123';
const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

async function auth(email: string) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return { Authorization: `Bearer ${res.body.token}` };
}

describe('Contacts (CRM-11)', () => {
  let rep: Record<string, string>;
  let rep2: Record<string, string>;
  let support: Record<string, string>;

  beforeAll(async () => {
    rep = await auth('rep@crm.test');
    rep2 = await auth('rep2@crm.test');
    support = await auth('support@crm.test');
  });

  it('TC-CONV-01 creates, edits, searches and deletes a contact', async () => {
    const id = unique();
    const email = `zed${id}@example.com`;

    const created = await request(app)
      .post('/api/v1/contacts')
      .set(rep)
      .send({ name: `Zed Tester ${id}`, email, phone: '9876543210', city: 'Bengaluru' });
    expect(created.status).toBe(201);
    expect(created.body.email).toBe(email);
    expect(created.body.referralCode).toMatch(/^REF[0-9A-F]{6}$/);

    const edited = await request(app)
      .patch(`/api/v1/contacts/${created.body.id}`)
      .set(rep)
      .send({ city: 'Pune' });
    expect(edited.status).toBe(200);
    expect(edited.body.city).toBe('Pune');

    const search = await request(app).get(`/api/v1/contacts?q=ZED TESTER ${id}`).set(rep);
    expect(search.status).toBe(200);
    expect(search.body.items.map((c: { id: string }) => c.id)).toContain(created.body.id);

    const removed = await request(app).delete(`/api/v1/contacts/${created.body.id}`).set(rep);
    expect(removed.status).toBe(204);

    const gone = await request(app).get(`/api/v1/contacts/${created.body.id}`).set(rep);
    expect(gone.status).toBe(404);
  });

  it("TC-CONV-02 a sales rep cannot see, edit or delete another rep's contacts", async () => {
    const created = await request(app)
      .post('/api/v1/contacts')
      .set(rep)
      .send({ name: 'Private Person', email: `private${unique()}@example.com` });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const list = await request(app).get('/api/v1/contacts?pageSize=100&q=Private Person').set(rep2);
    expect(list.status).toBe(200);
    expect(list.body.items.map((c: { id: string }) => c.id)).not.toContain(id);

    expect((await request(app).get(`/api/v1/contacts/${id}`).set(rep2)).status).toBe(403);
    expect(
      (await request(app).patch(`/api/v1/contacts/${id}`).set(rep2).send({ city: 'X' })).status,
    ).toBe(403);
    expect((await request(app).delete(`/api/v1/contacts/${id}`).set(rep2)).status).toBe(403);

    await request(app).delete(`/api/v1/contacts/${id}`).set(rep);
  });

  it('every contact a rep lists is one they own', async () => {
    const me = await request(app).get('/api/v1/auth/me').set(rep);
    const list = await request(app).get('/api/v1/contacts?pageSize=100').set(rep);
    expect(list.status).toBe(200);
    for (const c of list.body.items) expect(c.ownerId).toBe(me.body.id);
  });

  it('returns 409 for a duplicate email, on create and on edit', async () => {
    const email = `dup${unique()}@example.com`;
    const first = await request(app)
      .post('/api/v1/contacts')
      .set(rep)
      .send({ name: 'First', email });
    expect(first.status).toBe(201);

    const again = await request(app)
      .post('/api/v1/contacts')
      .set(rep)
      .send({ name: 'Second', email: email.toUpperCase() });
    expect(again.status).toBe(409);
    expect(again.body.code ?? again.body.error?.code).toBe('DUPLICATE_EMAIL');

    const other = await request(app)
      .post('/api/v1/contacts')
      .set(rep)
      .send({ name: 'Other', email: `other${unique()}@example.com` });
    const clash = await request(app)
      .patch(`/api/v1/contacts/${other.body.id}`)
      .set(rep)
      .send({ email });
    expect(clash.status).toBe(409);

    await request(app).delete(`/api/v1/contacts/${first.body.id}`).set(rep);
    await request(app).delete(`/api/v1/contacts/${other.body.id}`).set(rep);
  });

  it('caps pageSize at 100', async () => {
    const admin = await auth('admin@crm.test');
    const res = await request(app).get('/api/v1/contacts?pageSize=500').set(admin);
    expect(res.status).toBe(200);
    expect(res.body.pageSize).toBe(100);
    expect(res.body.items.length).toBeLessThanOrEqual(100);
  });

  it('rejects an invalid body with 400', async () => {
    const res = await request(app)
      .post('/api/v1/contacts')
      .set(rep)
      .send({ name: '', email: 'nope' });
    expect(res.status).toBe(400);
  });

  it('lets SUPPORT read contacts but not change them', async () => {
    expect((await request(app).get('/api/v1/contacts').set(support)).status).toBe(200);
    const res = await request(app)
      .post('/api/v1/contacts')
      .set(support)
      .send({ name: 'Nope', email: `nope${unique()}@example.com` });
    expect(res.status).toBe(403);
  });

  it('requires login', async () => {
    expect((await request(app).get('/api/v1/contacts')).status).toBe(401);
  });
});
