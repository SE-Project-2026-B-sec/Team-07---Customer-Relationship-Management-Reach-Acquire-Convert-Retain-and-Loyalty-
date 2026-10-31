import type { Prisma, Role } from '@prisma/client';
import { AppError } from '../../common/errors';
import { paged, toSkipTake } from '../../common/pagination';
import { type DealRow, dealsRepository as repo } from './deals.repository';
import type {
  CreateDealInput,
  ListDealsQuery,
  MoveStageInput,
  UpdateDealInput,
} from './deals.schema';

export interface Actor {
  id: string;
  role: Role;
}

// CRM-5 (authorize) is not merged yet, so the role check lives here for now.
const DEAL_ROLES: Role[] = ['ADMIN', 'SALES_MANAGER', 'SALES_REP'];

function assertAccess(actor: Actor) {
  if (!DEAL_ROLES.includes(actor.role)) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have access to deals');
  }
}

/** Admins and managers can change any deal; a Sales Rep only their own. */
function assertCanChange(actor: Actor, deal: DealRow) {
  if (actor.role === 'SALES_REP' && deal.ownerId !== actor.id) {
    throw new AppError(403, 'FORBIDDEN', 'You can only change your own deals');
  }
}

async function getDealOrThrow(id: string) {
  const deal = await repo.findById(id);
  if (!deal) throw new AppError(404, 'DEAL_NOT_FOUND', 'Deal not found');
  return deal;
}

const toDto = (d: DealRow) => ({
  id: d.id,
  title: d.title,
  value: d.value.toNumber(),
  stage: d.stage,
  expectedClose: d.expectedClose,
  wonAt: d.wonAt,
  contactId: d.contactId,
  contactName: d.contact.name,
  ownerId: d.ownerId,
  ownerName: d.owner.name,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});

export const dealsService = {
  async list(actor: Actor, query: ListDealsQuery) {
    assertAccess(actor);
    const where: Prisma.DealWhereInput = {
      ...(query.stage ? { stage: query.stage } : {}),
      ...(actor.role === 'SALES_REP' ? { ownerId: actor.id } : {}),
    };
    const { rows, total } = await repo.list(where, toSkipTake(query));
    return paged(rows.map(toDto), total, query);
  },

  async create(actor: Actor, input: CreateDealInput) {
    assertAccess(actor);
    const contact = await repo.findContact(input.contactId);
    if (!contact) throw new AppError(404, 'CONTACT_NOT_FOUND', 'Contact not found');
    const deal = await repo.create({
      title: input.title,
      value: input.value,
      expectedClose: input.expectedClose,
      contactId: contact.id,
      accountId: contact.accountId,
      ownerId: actor.id,
    });
    return toDto(deal);
  },

  async update(actor: Actor, id: string, input: UpdateDealInput) {
    assertAccess(actor);
    assertCanChange(actor, await getDealOrThrow(id));
    const deal = await repo.update(id, {
      title: input.title,
      value: input.value,
      expectedClose: input.expectedClose,
    });
    return toDto(deal);
  },

  /** Moving into WON stamps wonAt; moving out of WON clears it. */
  async moveStage(actor: Actor, id: string, { stage }: MoveStageInput) {
    assertAccess(actor);
    const existing = await getDealOrThrow(id);
    assertCanChange(actor, existing);
    if (existing.stage === stage) return toDto(existing);
    const deal = await repo.update(id, { stage, wonAt: stage === 'WON' ? new Date() : null });
    return toDto(deal);
  },

  /** Used by the "New deal" form until the contacts module (CRM-11) has its own list. */
  async searchContacts(actor: Actor, search?: string) {
    assertAccess(actor);
    return repo.searchContacts(search);
  },
};
