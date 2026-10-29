// CRM-11 tests for accounts.
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();
const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

async function auth(email: string) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'Password@123' });
  return { Authorization: `Bearer ${res.body.token}` };
}

describe('Accounts (CRM-11)', () => {
  let rep: Record<string, string>;
  let rep2: Record<string, string>;
  let manager: Record<string, string>;

  beforeAll(async () => {
    rep = await auth('rep@crm.test');
    rep2 = await auth('rep2@crm.test');
    manager = await auth('manager@crm.test');
  });

  it('creates, edits, lists with contactCount, and deletes an account', async () => {
    const name = `Acme ${unique()}`;
    const created = await request(app)
      .post('/api/v1/accounts')
      .set(rep)
      .send({ name, industry: 'Retail', city: 'Mysuru', website: 'https://acme.example.com' });
    expect(created.status).toBe(201);

    await request(app)
      .post('/api/v1/contacts')
      .set(rep)
      .send({ name: 'Acme Buyer', email: `buyer${unique()}@example.com`, accountId: created.body.id });

    const edited = await request(app)
      .patch(`/api/v1/accounts/${created.body.id}`)
      .set(rep)
      .send({ industry: 'Wholesale' });
    expect(edited.body.industry).toBe('Wholesale');

    const list = await request(app).get(`/api/v1/accounts?q=${encodeURIComponent(name)}`).set(rep);
    expect(list.status).toBe(200);
    expect(list.body.items[0].contactCount).toBe(1);

    const detail = await request(app).get(`/api/v1/accounts/${created.body.id}`).set(rep);
    expect(detail.body.contacts).toHaveLength(1);

    // A rep can't delete an account; a manager can.
    expect((await request(app).delete(`/api/v1/accounts/${created.body.id}`).set(rep)).status).toBe(403);
    expect((await request(app).delete(`/api/v1/accounts/${created.body.id}`).set(manager)).status).toBe(204);
  });

  it("hides another rep's contacts on the account detail page", async () => {
    const account = await request(app).post('/api/v1/accounts').set(rep).send({ name: `Shared ${unique()}` });
    await request(app)
      .post('/api/v1/contacts')
      .set(rep)
      .send({ name: 'Rep One Contact', email: `r1${unique()}@example.com`, accountId: account.body.id });

    const asRep2 = await request(app).get(`/api/v1/accounts/${account.body.id}`).set(rep2);
    expect(asRep2.status).toBe(200);
    expect(asRep2.body.contacts).toHaveLength(0);

    await request(app).delete(`/api/v1/accounts/${account.body.id}`).set(manager);
  });

  it('returns 404 for an unknown account', async () => {
    expect((await request(app).get('/api/v1/accounts/does-not-exist').set(rep)).status).toBe(404);
  });
});