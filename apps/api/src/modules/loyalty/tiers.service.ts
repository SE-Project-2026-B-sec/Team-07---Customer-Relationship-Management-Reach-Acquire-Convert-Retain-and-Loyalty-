// CRM-25 (CRM-F-051): loyalty tiers.
// A customer's tier is the highest tier whose minPoints they have reached, counted on
// LIFETIME points earned (every positive ledger row). Redeeming points never drops a tier.
// The tier is recalculated inside the same transaction that adds points (see orders.service).
import { TierName } from '@prisma/client';
import { AppError } from '../../common/errors';
import { prisma } from '../../common/prisma';
import type { UpdateTierBody } from './tiers.schema';

export const TIER_ORDER: TierName[] = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];

/** Pure rule: the highest tier whose threshold the points have reached (TC-LOY-02). */
export function tierFor(
  lifetimePoints: number,
  tiers: { name: TierName; minPoints: number }[],
): TierName {
  const reached = [...tiers]
    .sort((a, b) => a.minPoints - b.minPoints)
    .filter((t) => lifetimePoints >= t.minPoints);
  return reached.length ? reached[reached.length - 1].name : 'BRONZE';
}

export const tiersService = {
  list() {
    return prisma.tier.findMany({ orderBy: { minPoints: 'asc' } });
  },

  async update(name: string, body: UpdateTierBody) {
    if (!TIER_ORDER.includes(name as TierName)) {
      throw new AppError(400, 'INVALID_TIER', `Tier must be one of ${TIER_ORDER.join(', ')}`);
    }
    const tiers = await prisma.tier.findMany();
    if (!tiers.some((t) => t.name === name)) throw new AppError(404, 'NOT_FOUND', 'Tier not found');

    // Thresholds must keep the order BRONZE < SILVER < GOLD < PLATINUM, and BRONZE stays at 0.
    const next = tiers.map((t) => (t.name === name ? { ...t, minPoints: body.minPoints } : t));
    const byOrder = TIER_ORDER.map((n) => next.find((t) => t.name === n)).filter(
      Boolean,
    ) as typeof next;
    const increasing = byOrder.every((t, i) => i === 0 || t.minPoints > byOrder[i - 1].minPoints);
    if ((name === 'BRONZE' && body.minPoints !== 0) || !increasing) {
      throw new AppError(
        400,
        'INVALID_THRESHOLD',
        'Thresholds must go up from Bronze (0) to Silver, Gold and Platinum',
      );
    }
    return prisma.tier.update({
      where: { name: name as TierName },
      data: { minPoints: body.minPoints },
    });
  },
};
