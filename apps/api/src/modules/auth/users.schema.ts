// CRM-6 (CRM-F-003): request validation for user admin.
import { Role } from '@prisma/client';
import { z } from 'zod';

// POST /users
export const createUserBody = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  role: z.nativeEnum(Role),
  // Same strength rule as the SRS security requirements: 8+ chars, a letter and a number.
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Za-z]/, 'Password needs a letter')
    .regex(/[0-9]/, 'Password needs a number'),
});
export type CreateUserBody = z.infer<typeof createUserBody>;

// PATCH /users/:id — change role and/or activate/deactivate
export const updateUserBody = z
  .object({
    role: z.nativeEnum(Role).optional(),
    isActive: z.boolean().optional(),
    name: z.string().trim().min(1).max(120).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to update' });
export type UpdateUserBody = z.infer<typeof updateUserBody>;
