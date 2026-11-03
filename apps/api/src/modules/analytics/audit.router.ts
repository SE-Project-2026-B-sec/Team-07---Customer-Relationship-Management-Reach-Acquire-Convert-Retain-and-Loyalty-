// CRM-31: GET /audit-logs — who changed what and when (CRM-F-064). Admin only.
import { AuditAction, type Prisma } from '@prisma/client';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { AUDITED_MODELS } from '../../common/audit';
import { paged, paginationQuery, toSkipTake } from '../../common/pagination';
import { prisma } from '../../common/prisma';
import { validate } from '../../common/validate';
import { authenticate, authorize } from '../auth';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');

export const auditQuery = paginationQuery.extend({
  entity: z.enum(AUDITED_MODELS).optional(),
  entityId: z.string().min(1).max(100).optional(),
  userId: z.string().uuid().optional(),
  action: z.nativeEnum(AuditAction).optional(),
  from: day.optional(),
  to: day.optional(),
});
type AuditQuery = z.infer<typeof auditQuery>;

const DAY_MS = 86_400_000;

export const auditService = {
  async list(q: AuditQuery) {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.entity && { entity: q.entity }),
      ...(q.entityId && { entityId: q.entityId }),
      ...(q.userId && { userId: q.userId }),
      ...(q.action && { action: q.action }),
      ...((q.from || q.to) && {
        at: {
          ...(q.from && { gte: new Date(`${q.from}T00:00:00.000Z`) }),
          // "To" is inclusive: everything before the start of the next day.
          ...(q.to && { lt: new Date(Date.parse(`${q.to}T00:00:00.000Z`) + DAY_MS) }),
        },
      }),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { name: true, email: true, role: true } } },
        orderBy: [{ at: 'desc' }, { id: 'asc' }],
        ...toSkipTake(q),
      }),
      prisma.auditLog.count({ where }),
    ]);
    const data = rows.map((r) => ({
      id: r.id,
      at: r.at,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      userId: r.userId,
      userName: r.user?.name ?? null,
      userEmail: r.user?.email ?? null,
      userRole: r.user?.role ?? null,
      details: r.diffJson,
    }));
    return paged(data, total, q);
  },
};

export const auditRouter = Router();

auditRouter.get(
  '/audit-logs',
  authenticate,
  authorize('ADMIN'),
  validate(auditQuery, 'query'),
  (req: Request, res: Response, next: NextFunction) => {
    auditService
      .list(req.query as unknown as AuditQuery)
      .then((page) => res.json(page))
      .catch(next);
  },
);
