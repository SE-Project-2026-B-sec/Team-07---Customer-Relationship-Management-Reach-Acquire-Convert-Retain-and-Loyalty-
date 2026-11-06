// CRM-27 (CRM-F-053): referral codes and bonus points.
// Every customer has a referral code (made when the contact is created). When a NEW customer is
// created with someone's code, that referrer earns bonus points. The bonus is a REFERRAL row in
// the append-only points ledger, written in the same transaction that creates the customer,
// so there is never a customer without the bonus or a bonus without the customer (SAD ADR-3).
import { AppError } from '../../common/errors';
import { prisma } from '../../common/prisma';
import { tierFor } from './tiers.service';

/** The `tx` client inside prisma.$transaction(async (tx) => ...). */
type Db = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export const DEFAULT_REFERRAL_BONUS = 100;

/** The configured bonus: REFERRAL_BONUS_POINTS in .env, or 100 points. */
export function referralBonus(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.REFERRAL_BONUS_POINTS);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_REFERRAL_BONUS;
}

/** The customer who owns this referral code. Codes are not case-sensitive. */
export async function findReferrer(db: Db, code: string) {
  const referrer = await db.contact.findUnique({
    where: { referralCode: code.trim().toUpperCase() },
    select: { id: true, name: true },
  });
  if (!referrer) {
    throw new AppError(400, 'INVALID_REFERRAL_CODE', 'No customer has that referral code');
  }
  return referrer;
}

/**
 * Links a new customer to the customer who referred them and gives the referrer the bonus.
 * Must be called inside the transaction that created the new customer.
 */
export async function recordReferral(tx: Db, code: string, refereeId: string) {
  const referrer = await findReferrer(tx, code);
  if (referrer.id === refereeId) {
    throw new AppError(400, 'SELF_REFERRAL', 'A customer cannot use their own referral code');
  }

  // Lock the referrer, as CRM-24 does for orders, so two referrals or an order at the same
  // moment can't read the same old balance.
  await tx.$queryRaw`SELECT id FROM "Contact" WHERE id = ${referrer.id} FOR UPDATE`;

  const bonus = referralBonus();
  const last = await tx.pointsLedger.findFirst({
    where: { contactId: referrer.id },
    orderBy: [{ createdAt: 'desc' }, { balanceAfter: 'desc' }],
    select: { balanceAfter: true },
  });
  const balance = (last?.balanceAfter ?? 0) + bonus;

  await tx.referral.create({
    data: { referrerId: referrer.id, refereeId, bonusAwarded: true },
  });
  await tx.pointsLedger.create({
    data: { contactId: referrer.id, delta: bonus, reason: 'REFERRAL', balanceAfter: balance },
  });

  // CRM-25: bonus points count towards the tier, like any other earned points.
  const lifetime = await tx.pointsLedger.aggregate({
    where: { contactId: referrer.id, delta: { gt: 0 } },
    _sum: { delta: true },
  });
  const tiers = await tx.tier.findMany({ select: { name: true, minPoints: true } });
  await tx.contact.update({
    where: { id: referrer.id },
    data: { tier: tierFor(lifetime._sum.delta ?? 0, tiers) },
  });

  return { referrerId: referrer.id, referrerName: referrer.name, bonus, referrerBalance: balance };
}

export const referralsService = {
  /** GET /customers/:id/referrals — their code, who referred them, and who they referred. */
  async forCustomer(contactId: string) {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: {
        id: true,
        referralCode: true,
        referredBy: { select: { createdAt: true, referrer: { select: { id: true, name: true } } } },
        referralsMade: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            bonusAwarded: true,
            createdAt: true,
            referee: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!contact) throw new AppError(404, 'NOT_FOUND', 'Customer not found');

    const earned = await prisma.pointsLedger.aggregate({
      where: { contactId, reason: 'REFERRAL' },
      _sum: { delta: true },
    });
    return {
      contactId: contact.id,
      referralCode: contact.referralCode,
      bonusPerReferral: referralBonus(),
      bonusEarned: earned._sum.delta ?? 0,
      referredBy: contact.referredBy
        ? { ...contact.referredBy.referrer, referredAt: contact.referredBy.createdAt }
        : null,
      referrals: contact.referralsMade.map((r) => ({
        id: r.id,
        customerId: r.referee.id,
        customerName: r.referee.name,
        bonusAwarded: r.bonusAwarded,
        referredAt: r.createdAt,
      })),
    };
  },
};
