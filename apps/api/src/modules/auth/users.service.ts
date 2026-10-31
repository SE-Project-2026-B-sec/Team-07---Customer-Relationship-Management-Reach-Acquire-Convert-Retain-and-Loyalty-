// CRM-6 (CRM-F-003): admins create users, change roles, and deactivate/reactivate them.
// A deactivated user cannot log in (TC-AUTH-04) — Balla's login (CRM-4) already rejects
// users with isActive = false, so deactivating here is enough.
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors';
import { prisma } from '../../common/prisma';
import type { CreateUserBody, UpdateUserBody } from './users.schema';

type CurrentUser = { id: string; role: string };

// Never send password hashes to the browser.
const publicFields = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export const usersService = {
  list() {
    return prisma.user.findMany({ select: publicFields, orderBy: { name: 'asc' } });
  },

  async create(body: CreateUserBody) {
    const { password, ...rest } = body;
    if (await prisma.user.findUnique({ where: { email: rest.email } })) {
      throw new AppError(409, 'DUPLICATE_EMAIL', 'A user with this email already exists');
    }
    return prisma.user.create({
      data: { ...rest, passwordHash: await bcrypt.hash(password, 10), isActive: true },
      select: publicFields,
    });
  },

  async update(admin: CurrentUser, id: string, body: UpdateUserBody) {
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');

    // Stop an admin locking themselves out.
    if (id === admin.id && (body.isActive === false || (body.role && body.role !== 'ADMIN'))) {
      throw new AppError(
        400,
        'CANNOT_CHANGE_SELF',
        'You cannot deactivate yourself or remove your own admin role',
      );
    }
    return prisma.user.update({ where: { id }, data: body, select: publicFields });
  },
};
