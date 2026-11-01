import type { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors';
import { paged, toSkipTake } from '../../common/pagination';
import { assertCanModify, type AuthUser, ownedBy } from '../auth';
import { type LeadRow, leadsRepository as repo } from './leads.repository';
import type {
  CreateLeadInput,
  ListLeadsQuery,
  PublicLeadInput,
  UpdateLeadInput,
} from './leads.schema';

export interface NewLead {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  source: string;
  campaignId?: string;
  ownerId?: string | null;
}

const toDto = (l: LeadRow) => ({
  id: l.id,
  name: l.name,
  email: l.email,
  phone: l.phone,
  company: l.company,
  source: l.source,
  status: l.status,
  score: l.score,
  isDuplicate: l.isDuplicate,
  ownerId: l.ownerId,
  ownerName: l.owner?.name ?? null,
  campaignId: l.campaignId,
  campaignName: l.campaign?.name ?? null,
  convertedContactId: l.convertedContactId,
  createdAt: l.createdAt,
  updatedAt: l.updatedAt,
});

export type LeadDto = ReturnType<typeof toDto>;

async function getLeadOrThrow(id: string) {
  const lead = await repo.findById(id);
  if (!lead) throw new AppError(404, 'LEAD_NOT_FOUND', 'Lead not found');
  return lead;
}

/**
 * The one place leads are created (web form, manual entry and CSV import CRM-9 all use it).
 * A duplicate email is still saved, but flagged so a manager can review it (CRM-F-020).
 */
export async function createLead(input: NewLead): Promise<LeadDto> {
  const email = input.email.trim().toLowerCase();
  const campaignId =
    input.campaignId && (await repo.campaignExists(input.campaignId)) ? input.campaignId : null;
  const lead = await repo.create({
    name: input.name.trim(),
    email,
    phone: input.phone || null,
    company: input.company || null,
    source: input.source,
    campaignId,
    ownerId: input.ownerId ?? null,
    isDuplicate: await repo.emailExists(email),
  });
  return toDto(lead);
}

export const leadsService = {
  /** Website enquiry form. Bots that fill the hidden honeypot field get a fake success. */
  async capturePublic(input: PublicLeadInput) {
    if (input.website) return { received: true };
    await createLead({ ...input, source: input.campaignId ? 'CAMPAIGN' : 'WEB' });
    return { received: true };
  },

  async list(user: AuthUser, query: ListLeadsQuery) {
    const where: Prisma.LeadWhereInput = {
      ...ownedBy(user),
      ...(query.status ? { status: query.status } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.duplicates ? { isDuplicate: query.duplicates === 'true' } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
              { company: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const { rows, total } = await repo.list(where, toSkipTake(query));
    return paged(rows.map(toDto), total, query);
  },

  async get(user: AuthUser, id: string) {
    const lead = await getLeadOrThrow(id);
    if (user.role === 'SALES_REP' && lead.ownerId !== user.id) {
      throw new AppError(404, 'LEAD_NOT_FOUND', 'Lead not found');
    }
    return toDto(lead);
  },

  /** Manual entry. A Sales Rep's own leads are assigned to them; others start unassigned. */
  create(user: AuthUser, input: CreateLeadInput) {
    return createLead({ ...input, ownerId: user.role === 'SALES_REP' ? user.id : null });
  },

  async update(user: AuthUser, id: string, input: UpdateLeadInput) {
    const existing = await getLeadOrThrow(id);
    assertCanModify(user, existing.ownerId);
    if (existing.status === 'CONVERTED') {
      throw new AppError(409, 'LEAD_CONVERTED', 'This lead has already been converted');
    }
    const email = input.email?.toLowerCase();
    const lead = await repo.update(id, {
      name: input.name,
      phone: input.phone,
      company: input.company,
      status: input.status,
      ...(email && email !== existing.email
        ? { email, isDuplicate: await repo.emailExists(email, id) }
        : {}),
    });
    return toDto(lead);
  },
};
