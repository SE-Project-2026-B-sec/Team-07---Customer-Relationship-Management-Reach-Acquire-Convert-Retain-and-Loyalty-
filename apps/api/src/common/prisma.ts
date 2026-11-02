import { PrismaClient } from '@prisma/client';
import { auditExtension } from './audit';

// One shared client for the whole API. Modules import this through their repository files.
const base = new PrismaClient();

// CRM-31: every create/update/delete made during an API request is written to AuditLog.
export const prisma = base.$extends(auditExtension(base));
