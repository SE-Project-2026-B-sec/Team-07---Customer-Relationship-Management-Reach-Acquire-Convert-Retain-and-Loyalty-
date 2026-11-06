// CRM-11 (CRM-F-030): business rules for contacts.
//  - A SALES_REP only ever sees, edits or deletes contacts they own (TC-CONV-02).
//  - Email must be unique across contacts → 409 DUPLICATE_EMAIL.
//  - Every new contact gets a referral code like REFA1B2C3.
// This is the only contacts file other modules may import (e.g. CRM-13 convert lead).
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors';
import { prisma } from '../../common/prisma';
import { recordReferral } from '../loyalty';
import { contactsRepository as repo } from './contacts.repository';
import type { CreateContactBody, ListContactsQuery, UpdateContactBody } from './contacts.schema';

export type CurrentUser = { id: string; role: string };

const isRep = (user: CurrentUser) => user.role === 'SALES_REP';

// Reps are limited to their own records; every other role sees everything.
function ownerScope(user: CurrentUser): Prisma.ContactWhereInput {
  return isRep(user) ? { ownerId: user.id } : {};
}

async function newReferralCode(): Promise<string> {
  // 3 random bytes → 6 hex characters. Retry on the (very unlikely) clash.
  for (let i = 0; i < 5; i++) {
    const code = 'REF' + crypto.randomBytes(3).toString('hex').toUpperCase();
    if (!(await repo.findByReferralCode(code))) return code;
  }
  throw new AppError(500, 'REFERRAL_CODE_FAILED', 'Could not generate a referral code');
}

async function assertEmailFree(email: string, exceptId?: string) {
  const existing = await repo.findByEmail(email);
  if (existing && existing.id !== exceptId) {
    throw new AppError(409, 'DUPLICATE_EMAIL', 'A contact with this email already exists');
  }
}

// Loads a contact and checks the current user may touch it.
async function getOwned(user: CurrentUser, id: string) {
  const contact = await repo.findById(id);
  if (!contact) throw new AppError(404, 'NOT_FOUND', 'Contact not found');
  if (isRep(user) && contact.ownerId !== user.id) {
    throw new AppError(403, 'FORBIDDEN', 'You can only access your own contacts');
  }
  return contact;
}

export const contactsService = {
  async list(user: CurrentUser, query: ListContactsQuery) {
    const { q, city, accountId, page, pageSize } = query;
    const where: Prisma.ContactWhereInput = {
      ...ownerScope(user),
      ...(city && { city: { equals: city, mode: 'insensitive' } }),
      ...(accountId && { accountId }),
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
        ],
      }),
    };
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      repo.findMany(where, skip, pageSize),
      repo.count(where),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },

  get(user: CurrentUser, id: string) {
    return getOwned(user, id);
  },

  async create(user: CurrentUser, body: CreateContactBody) {
    await assertEmailFree(body.email);
    const { referredByCode, ...fields } = body;
    try {
      const data = { ...fields, ownerId: user.id, referralCode: await newReferralCode() };
      if (!referredByCode) return await repo.create(data);
      // CRM-27: create the customer and give the referrer their bonus together, or neither.
      return await prisma.$transaction(async (tx) => {
        const contact = await tx.contact.create({ data, include: { account: true } });
        await recordReferral(tx, referredByCode, contact.id);
        return contact;
      });
    } catch (err) {
      // Two requests racing past assertEmailFree: the database unique index catches it.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError(409, 'DUPLICATE_EMAIL', 'A contact with this email already exists');
      }
      throw err;
    }
  },

  async update(user: CurrentUser, id: string, body: UpdateContactBody) {
    await getOwned(user, id);
    if (body.email) await assertEmailFree(body.email, id);
    return repo.update(id, body);
  },

  /**
   * Delete on request (CRM-SR-007, DPDP Act 2023). A contact with no history is deleted. One that
   * deals, orders, tickets or points still refer to cannot be removed without breaking those
   * records, so their personal data is erased instead (name, email, phone, city, tags, consent,
   * the lead they came from, campaign history and the audit details that held it).
   */
  async remove(user: CurrentUser, id: string) {
    await getOwned(user, id);
    try {
      await repo.delete(id);
    } catch (err) {
      const fkViolation =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003';
      if (!fkViolation) throw err;
      const leadIds = await repo.anonymise(id);
      await repo.scrubAudit('Contact', [id]);
      await repo.scrubAudit('Lead', leadIds);
      await repo.logErasure(id, user.id);
    }
  },
};
