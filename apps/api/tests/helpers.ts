import type { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/common/prisma';
import { signToken } from '../src/modules/auth/auth.service';

export const TEST_PASSWORD = 'Test@12345';

/** Creates a throwaway user for one test file. Remember to call deleteTestUsers() in afterAll. */
export async function createTestUser(role: Role, overrides: { isActive?: boolean } = {}) {
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return prisma.user.create({
    data: {
      email: `test-${role.toLowerCase()}-${tag}@crm.test`,
      name: `Test ${role}`,
      role,
      passwordHash: await bcrypt.hash(TEST_PASSWORD, 10),
      isActive: overrides.isActive ?? true,
    },
  });
}

export const deleteTestUsers = () =>
  prisma.user.deleteMany({ where: { email: { startsWith: 'test-' } } });

/** Authorization header for a user, for calling protected routes in tests. */
export const authHeader = (user: { id: string; role: Role }) => ({
  Authorization: `Bearer ${signToken(user)}`,
});
