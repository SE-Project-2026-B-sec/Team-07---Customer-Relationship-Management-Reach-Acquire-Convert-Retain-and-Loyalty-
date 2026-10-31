// CRM-10 (CRM-F-023): assign leads to sales reps, one at a time or round-robin.
// Only ADMIN and SALES_MANAGER may assign (enforced in the router); reps get 403 (TC-ACQ-06).
import { AppError } from '../../common/errors';
import { prisma } from '../../common/prisma';
import type { AssignLeadBody, RoundRobinBody } from './lead-assignment.schema';

/**
 * Pure round-robin split: lead i goes to rep i mod n.
 * 6 leads over 3 reps → 2 each (TC-ACQ-05). Exported so it can be unit-tested.
 */
export function roundRobin(leadIds: string[], repIds: string[]): Map<string, string[]> {
  if (repIds.length === 0)
    throw new AppError(400, 'NO_REPS', 'There are no active sales reps to assign to');
  const result = new Map<string, string[]>(repIds.map((id) => [id, []]));
  leadIds.forEach((leadId, i) => result.get(repIds[i % repIds.length])!.push(leadId));
  return result;
}

async function activeReps(ids?: string[]) {
  const reps = await prisma.user.findMany({
    where: { role: 'SALES_REP', isActive: true, ...(ids && { id: { in: ids } }) },
    select: { id: true },
  });
  if (ids && reps.length !== new Set(ids).size) {
    throw new AppError(400, 'INVALID_REP', 'Every selected user must be an active sales rep');
  }
  return reps.map((r) => r.id);
}

export const leadAssignmentService = {
  async assignOne(leadId: string, body: AssignLeadBody) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true } });
    if (!lead) throw new AppError(404, 'NOT_FOUND', 'Lead not found');
    await activeReps([body.ownerId]);
    return prisma.lead.update({ where: { id: leadId }, data: { ownerId: body.ownerId } });
  },

  async assignRoundRobin(body: RoundRobinBody) {
    const leadIds = [...new Set(body.leadIds)];
    const found = await prisma.lead.count({ where: { id: { in: leadIds } } });
    if (found !== leadIds.length)
      throw new AppError(404, 'NOT_FOUND', 'One or more leads were not found');

    // Fairness across batches: reps with the fewest leads go first in the rotation.
    const repIds = await activeReps(body.repIds);
    const load = await prisma.lead.groupBy({
      by: ['ownerId'],
      where: { ownerId: { in: repIds } },
      _count: { _all: true },
    });
    const countOf = (id: string) => load.find((l) => l.ownerId === id)?._count._all ?? 0;
    const ordered = [...repIds].sort((a, b) => countOf(a) - countOf(b) || a.localeCompare(b));

    const plan = roundRobin(leadIds, ordered);

    // All-or-nothing: either every lead is assigned or none are.
    await prisma.$transaction(
      [...plan].map(([ownerId, ids]) =>
        prisma.lead.updateMany({ where: { id: { in: ids } }, data: { ownerId } }),
      ),
    );

    return {
      assigned: leadIds.length,
      perRep: [...plan].map(([repId, ids]) => ({ repId, count: ids.length, leadIds: ids })),
    };
  },
};
