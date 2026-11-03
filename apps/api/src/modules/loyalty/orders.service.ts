// CRM-24 (CRM-F-050, CRM-NF-009): orders earn loyalty points.
// Rule: 1 point per full Rs 100 spent, so Rs 2,550 -> 25 points (TC-LOY-01).
// The order and its EARN ledger row are written in ONE transaction: both or neither.
// The ledger is append-only; a contact's balance is the latest row's balanceAfter (SAD ADR-3).
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors';
import { paged, toSkipTake } from '../../common/pagination';
import { prisma } from '../../common/prisma';
import type { CreateOrderBody, ListOrdersQuery } from './orders.schema';

export const RUPEES_PER_POINT = 100;

/** Whole points for an amount in rupees. Works in paise so 2550.00 never becomes 2549.99. */
export function pointsFor(amount: number): number {
  const paise = Math.round(amount * 100);
  return Math.floor(paise / (RUPEES_PER_POINT * 100));
}

const newOrderNo = () =>
  `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

// Newest ledger row first; its balanceAfter is the current balance.
const latestFirst = [{ createdAt: 'desc' as const }, { balanceAfter: 'desc' as const }];

export const ordersService = {
  async create(body: CreateOrderBody) {
    return prisma.$transaction(async (tx) => {
      // Lock this customer's row so two orders at the same moment can't both read the
      // same old balance and write the same balanceAfter.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Contact" WHERE id = ${body.contactId} FOR UPDATE`;
      if (locked.length === 0) throw new AppError(404, 'NOT_FOUND', 'Customer not found');

      if (body.dealId) {
        const deal = await tx.deal.findUnique({
          where: { id: body.dealId },
          select: { contactId: true },
        });
        if (!deal) throw new AppError(404, 'NOT_FOUND', 'Deal not found');
        if (deal.contactId && deal.contactId !== body.contactId) {
          throw new AppError(400, 'DEAL_MISMATCH', 'That deal belongs to a different customer');
        }
      }

      const order = await tx.order.create({
        data: {
          orderNo: newOrderNo(),
          amount: new Prisma.Decimal(body.amount.toFixed(2)),
          contactId: body.contactId,
          dealId: body.dealId,
          ...(body.orderedAt && { orderedAt: body.orderedAt }),
        },
      });

      const earned = pointsFor(body.amount);
      const last = await tx.pointsLedger.findFirst({
        where: { contactId: body.contactId },
        orderBy: latestFirst,
        select: { balanceAfter: true },
      });
      let balance = last?.balanceAfter ?? 0;

      // An order under Rs 100 earns nothing, so no ledger row is written for it.
      if (earned > 0) {
        balance += earned;
        await tx.pointsLedger.create({
          data: {
            contactId: body.contactId,
            delta: earned,
            reason: 'EARN',
            balanceAfter: balance,
            orderId: order.id,
          },
        });
      }

      return { order, pointsEarned: earned, balance };
    });
  },

  async list(query: ListOrdersQuery) {
    const where: Prisma.OrderWhereInput = query.contactId ? { contactId: query.contactId } : {};
    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        ...toSkipTake(query),
        orderBy: { orderedAt: 'desc' },
        include: {
          contact: { select: { id: true, name: true } },
          ledger: { select: { delta: true, reason: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);
    return paged(items, total, query);
  },

  async get(id: string) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: { contact: { select: { id: true, name: true, email: true } }, ledger: true },
    });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found');
    return order;
  },

  /** GET /customers/:id/points — balance, tier and the latest 50 ledger rows. */
  async points(contactId: string) {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, name: true, tier: true },
    });
    if (!contact) throw new AppError(404, 'NOT_FOUND', 'Customer not found');
    const ledger = await prisma.pointsLedger.findMany({
      where: { contactId },
      orderBy: latestFirst,
      take: 50,
      include: { order: { select: { orderNo: true, amount: true } } },
    });
    const balance = ledger[0]?.balanceAfter ?? 0;
    return { contactId: contact.id, name: contact.name, tier: contact.tier, balance, ledger };
  },
};
