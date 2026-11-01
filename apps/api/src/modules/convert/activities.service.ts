import type { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors';
import { paged, toSkipTake } from '../../common/pagination';
import { type ActivityRow, activitiesRepository as repo } from './activities.repository';
import type {
  CreateActivityInput,
  ListActivitiesQuery,
  UpdateActivityInput,
} from './activities.schema';
import type { Actor } from './deals.service';

/** A Sales Rep sees what they logged, plus anything on a lead, contact or deal they own. */
function visibleTo(actor: Actor): Prisma.ActivityWhereInput {
  if (actor.role !== 'SALES_REP') return {};
  return {
    OR: [
      { userId: actor.id },
      { deal: { ownerId: actor.id } },
      { contact: { ownerId: actor.id } },
      { lead: { ownerId: actor.id } },
    ],
  };
}

/** Only the person who logged an activity, an Admin or a Sales Manager can change it. */
function assertCanChange(actor: Actor, activity: ActivityRow) {
  const privileged = actor.role === 'ADMIN' || actor.role === 'SALES_MANAGER';
  if (!privileged && activity.userId !== actor.id) {
    throw new AppError(403, 'FORBIDDEN', 'You can only change activities you logged');
  }
}

/** Overdue means due in the past and not done (CRM-14). */
const isOverdue = (a: ActivityRow) => !a.done && a.dueAt !== null && a.dueAt.getTime() < Date.now();

const toDto = (a: ActivityRow) => ({
  id: a.id,
  type: a.type,
  subject: a.subject,
  notes: a.notes,
  dueAt: a.dueAt,
  done: a.done,
  overdue: isOverdue(a),
  createdAt: a.createdAt,
  userId: a.userId,
  userName: a.user.name,
  leadId: a.leadId,
  contactId: a.contactId,
  dealId: a.dealId,
  linkLabel: a.deal?.title ?? a.contact?.name ?? a.lead?.name ?? null,
});

export const activitiesService = {
  async list(actor: Actor, query: ListActivitiesQuery) {
    const filters: Prisma.ActivityWhereInput = {
      ...(query.leadId ? { leadId: query.leadId } : {}),
      ...(query.contactId ? { contactId: query.contactId } : {}),
      ...(query.dealId ? { dealId: query.dealId } : {}),
      ...(query.mine ? { userId: actor.id } : {}),
      ...(query.overdue ? { done: false, dueAt: { lt: new Date() } } : {}),
    };
    const { rows, total } = await repo.list(
      { AND: [visibleTo(actor), filters] },
      toSkipTake(query),
    );
    return paged(rows.map(toDto), total, query);
  },

  async create(actor: Actor, input: CreateActivityInput) {
    if (input.leadId && !(await repo.leadExists(input.leadId))) {
      throw new AppError(404, 'LEAD_NOT_FOUND', 'Lead not found');
    }
    if (input.contactId && !(await repo.contactExists(input.contactId))) {
      throw new AppError(404, 'CONTACT_NOT_FOUND', 'Contact not found');
    }
    if (input.dealId && !(await repo.dealExists(input.dealId))) {
      throw new AppError(404, 'DEAL_NOT_FOUND', 'Deal not found');
    }
    const row = await repo.create({
      type: input.type,
      subject: input.subject,
      notes: input.notes,
      dueAt: input.dueAt,
      leadId: input.leadId,
      contactId: input.contactId,
      dealId: input.dealId,
      userId: actor.id,
    });
    return toDto(row);
  },

  async update(actor: Actor, id: string, input: UpdateActivityInput) {
    const existing = await repo.findById(id);
    if (!existing) throw new AppError(404, 'ACTIVITY_NOT_FOUND', 'Activity not found');
    assertCanChange(actor, existing);
    const row = await repo.update(id, {
      type: input.type,
      subject: input.subject,
      notes: input.notes,
      dueAt: input.dueAt,
      done: input.done,
    });
    return toDto(row);
  },
};
