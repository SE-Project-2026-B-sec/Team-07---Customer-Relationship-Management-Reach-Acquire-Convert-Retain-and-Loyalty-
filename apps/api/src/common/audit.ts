// CRM-31: the common audit hook (SAD 3.3). Every create, update and delete that an API request
// makes on a business table is written to AuditLog with who, what and when (CRM-F-064).
// It lives in the shared Prisma client, so modules do not have to remember to call it.
//
// - Only writes made during an HTTP request are logged (not the seed script or test set-up).
// - Updates store just the fields that changed: { field: { from, to } }.
// - Passwords, tokens and secrets are never stored (CRM-SR-002).
// - Known limit: inside a transaction that later rolls back, the audit row is still kept.
import { Prisma, type AuditAction, type PrismaClient } from '@prisma/client';
import { logger } from './logger';
import { currentRequest } from './request-context';

/** Tables whose changes are audited. Append-only history tables (points ledger, campaign
 *  events, notifications) and the audit log itself are left out. */
export const AUDITED_MODELS = [
  'User',
  'Segment',
  'Campaign',
  'Lead',
  'LeadScoreRule',
  'Account',
  'Contact',
  'Deal',
  'Activity',
  'Quote',
  'Ticket',
  'Order',
  'Tier',
  'Reward',
  'Redemption',
  'Referral',
] as const;

const AUDITED = new Set<string>(AUDITED_MODELS);
const SECRET_FIELD = /password|token|secret/i;
const IGNORED_FIELDS = new Set(['updatedAt']);

type Row = Record<string, unknown>;
type Changes = Record<string, { from: unknown; to: unknown }>;
type Delegate = {
  findUnique: (args: { where: unknown }) => Promise<Row | null>;
};

/** Plain JSON copy with secret fields replaced, so Dates/Decimals are stored as strings. */
export function sanitize(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value ?? null, (key, v) => (SECRET_FIELD.test(key) ? '[redacted]' : v)),
  );
}

/** Fields whose value differs between two versions of a row. */
export function diff(before: Row, after: Row): Changes {
  const changes: Changes = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (IGNORED_FIELDS.has(key)) continue;
    const from = sanitize(before[key]);
    const to = sanitize(after[key]);
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changes[key] = SECRET_FIELD.test(key)
        ? { from: '[redacted]', to: '[redacted]' }
        : { from, to };
    }
  }
  return changes;
}

const delegateFor = (base: PrismaClient, model: string) =>
  (base as unknown as Record<string, Delegate>)[model.charAt(0).toLowerCase() + model.slice(1)];

/** Builds the Prisma extension. `base` is the plain client, used for reads and audit writes. */
export function auditExtension(base: PrismaClient) {
  async function record(
    model: string,
    action: AuditAction,
    entityId: unknown,
    details: Prisma.InputJsonValue,
  ) {
    try {
      await base.auditLog.create({
        data: {
          userId: currentRequest()?.user?.id ?? null,
          entity: model,
          entityId: typeof entityId === 'string' ? entityId : '*',
          action,
          diffJson: details,
        },
      });
    } catch (err) {
      // Never fail the user's action because the audit write failed; make it visible instead.
      logger.error({ err, model, action }, 'Audit log write failed');
    }
  }

  return Prisma.defineExtension({
    name: 'audit-log',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!currentRequest() || !AUDITED.has(model)) return query(args);
          const table = delegateFor(base, model);
          const where = (args as { where?: unknown }).where;

          switch (operation) {
            case 'create': {
              const result = (await query(args)) as Row;
              await record(model, 'CREATE', result.id, { after: sanitize(result) });
              return result;
            }
            case 'update':
            case 'upsert': {
              const before = await table.findUnique({ where });
              const result = (await query(args)) as Row;
              const id = before?.id ?? result.id;
              const after = id ? await table.findUnique({ where: { id } }) : result;
              if (!before) {
                await record(model, 'CREATE', id, { after: sanitize(after) });
              } else {
                const changes = diff(before, after ?? {});
                if (Object.keys(changes).length > 0) {
                  await record(model, 'UPDATE', id, { changes } as Prisma.InputJsonValue);
                }
              }
              return result;
            }
            case 'delete': {
              const before = await table.findUnique({ where });
              const result = await query(args);
              await record(model, 'DELETE', before?.id, { before: sanitize(before) });
              return result;
            }
            case 'createMany':
            case 'createManyAndReturn':
            case 'updateMany':
            case 'updateManyAndReturn':
            case 'deleteMany': {
              const result = await query(args);
              const count = Array.isArray(result)
                ? result.length
                : ((result as { count?: number }).count ?? 0);
              if (count > 0) {
                const action: AuditAction = operation.startsWith('create')
                  ? 'CREATE'
                  : operation.startsWith('update')
                    ? 'UPDATE'
                    : 'DELETE';
                await record(model, action, '*', { bulk: true, count, where: sanitize(where) });
              }
              return result;
            }
            default:
              return query(args);
          }
        },
      },
    },
  });
}
