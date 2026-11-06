// CRM-26 (CRM-F-052): reward catalogue and redemption.
// Redeeming happens in ONE transaction:
//   1. lock the customer's row (two redemptions at once wait their turn: no double spend, TC-OPS-04)
//   2. check the balance — not enough points -> 409, nothing written (TC-LOY-03)
//   3. take one unit of stock (only if stock > 0)
//   4. append a REDEEM row with a negative delta, then the Redemption that points at it
// Tiers count lifetime earned points, so redeeming never lowers a tier (CRM-25).
import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors';
import { prisma } from '../../common/prisma';
import type { CreateRewardBody, RedeemBody, UpdateRewardBody } from './rewards.schema';

export const rewardsService = {
  // Everyone sees active rewards; admins also see inactive ones.
  list(isAdmin: boolean) {
    return prisma.reward.findMany({
      where: isAdmin ? {} : { isActive: true },
      orderBy: [{ isActive: 'desc' }, { pointsCost: 'asc' }],
    });
  },

  create(body: CreateRewardBody) {
    return prisma.reward.create({ data: body });
  },

  async update(id: string, body: UpdateRewardBody) {
    const exists = await prisma.reward.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new AppError(404, 'NOT_FOUND', 'Reward not found');
    return prisma.reward.update({ where: { id }, data: body });
  },

  async redeem(rewardId: string, body: RedeemBody) {
    return prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Contact" WHERE id = ${body.contactId} FOR UPDATE`;
      if (locked.length === 0) throw new AppError(404, 'NOT_FOUND', 'Customer not found');

      const reward = await tx.reward.findUnique({ where: { id: rewardId } });
      if (!reward) throw new AppError(404, 'NOT_FOUND', 'Reward not found');
      if (!reward.isActive)
        throw new AppError(409, 'REWARD_INACTIVE', 'This reward is not available');

      const last = await tx.pointsLedger.findFirst({
        where: { contactId: body.contactId },
        orderBy: [{ createdAt: 'desc' }, { balanceAfter: 'desc' }],
        select: { balanceAfter: true },
      });
      const balance = last?.balanceAfter ?? 0;
      if (balance < reward.pointsCost) {
        throw new AppError(
          409,
          'INSUFFICIENT_POINTS',
          `Not enough points: has ${balance}, needs ${reward.pointsCost}`,
        );
      }

      // Take one unit only while stock remains (safe even if two customers race for the last one).
      const taken = await tx.reward.updateMany({
        where: { id: rewardId, stock: { gt: 0 } },
        data: { stock: { decrement: 1 } },
      });
      if (taken.count === 0) throw new AppError(409, 'OUT_OF_STOCK', 'This reward is out of stock');

      const ledger = await tx.pointsLedger.create({
        data: {
          contactId: body.contactId,
          delta: -reward.pointsCost,
          reason: 'REDEEM',
          balanceAfter: balance - reward.pointsCost,
        },
      });
      const redemption = await tx.redemption.create({
        data: { contactId: body.contactId, rewardId, ledgerId: ledger.id },
      });

      return {
        redemption,
        reward: { id: reward.id, name: reward.name, pointsCost: reward.pointsCost },
        pointsSpent: reward.pointsCost,
        balance: ledger.balanceAfter,
      };
    });
  },

  // A customer's redemption history, newest first.
  history(contactId: string) {
    return prisma.redemption.findMany({
      where: { contactId } satisfies Prisma.RedemptionWhereInput,
      orderBy: { redeemedAt: 'desc' },
      include: { reward: { select: { id: true, name: true, pointsCost: true } } },
    });
  },
};
