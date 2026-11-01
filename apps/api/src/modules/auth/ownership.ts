import { AppError } from '../../common/errors';
import type { AuthUser } from './auth.service';

/**
 * CRM-F-030: a Sales Rep only sees records they own. Spread this into a Prisma where:
 *   prisma.contact.findMany({ where: { ...ownedBy(req.user!), city } })
 * Every other role gets {} (no filter).
 */
export const ownedBy = (user: AuthUser): { ownerId?: string } =>
  user.role === 'SALES_REP' ? { ownerId: user.id } : {};

/**
 * Throws 403 if a Sales Rep tries to change a record someone else owns.
 * Call it after loading the record: assertCanModify(req.user!, deal.ownerId)
 */
export function assertCanModify(user: AuthUser, ownerId: string | null | undefined) {
  if (user.role === 'SALES_REP' && ownerId !== user.id) {
    throw new AppError(403, 'FORBIDDEN', 'You can only change records assigned to you');
  }
}
