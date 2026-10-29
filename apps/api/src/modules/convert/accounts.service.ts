// CRM-11: business rules for accounts (companies).
// Accounts are shared by the sales team, but on an account's detail page a SALES_REP
// only sees the contacts they own, so CRM-F-030's "rep cannot see others' records" still holds.
import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors';
import { accountsRepository as repo } from './accounts.repository';
import type { CurrentUser } from './contacts.service';
import type { CreateAccountBody, ListAccountsQuery, UpdateAccountBody } from './accounts.schema';

const contactScope = (user: CurrentUser): Prisma.ContactWhereInput =>
  user.role === 'SALES_REP' ? { ownerId: user.id } : {};

async function assertExists(id: string) {
  if (!(await repo.exists(id))) throw new AppError(404, 'NOT_FOUND', 'Account not found');
}

export const accountsService = {
  async list(_user: CurrentUser, query: ListAccountsQuery) {
    const { q, city, industry, page, pageSize } = query;
    const where: Prisma.AccountWhereInput = {
      ...(q && { name: { contains: q, mode: 'insensitive' } }),
      ...(city && { city: { equals: city, mode: 'insensitive' } }),
      ...(industry && { industry: { equals: industry, mode: 'insensitive' } }),
    };
    const skip = (page - 1) * pageSize;
    const [rows, total] = await Promise.all([
      repo.findMany(where, skip, pageSize),
      repo.count(where),
    ]);
    const items = rows.map(({ _count, ...account }) => ({
      ...account,
      contactCount: _count.contacts,
    }));
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },

  async get(user: CurrentUser, id: string) {
    const account = await repo.findById(id, contactScope(user));
    if (!account) throw new AppError(404, 'NOT_FOUND', 'Account not found');
    return account;
  },

  create(_user: CurrentUser, body: CreateAccountBody) {
    return repo.create(body);
  },

  async update(_user: CurrentUser, id: string, body: UpdateAccountBody) {
    await assertExists(id);
    return repo.update(id, body);
  },

  async remove(user: CurrentUser, id: string) {
    // A rep may not delete a company that other reps' contacts belong to.
    if (user.role === 'SALES_REP') {
      throw new AppError(403, 'FORBIDDEN', 'Only managers and admins can delete accounts');
    }
    await assertExists(id);
    await repo.delete(id);
  },
};
