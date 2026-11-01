// CRM-13 (CRM-F-032, CRM-NF-009): turn a qualified lead into a contact, an account and
// optionally a deal — all inside ONE database transaction. If any step throws, Prisma
// rolls everything back, so we never end up with half a conversion.
import crypto from 'crypto';
import { AppError } from '../../common/errors';
import { prisma } from '../../common/prisma';
import type { CurrentUser } from './contacts.service';
import type { ConvertLeadBody } from './convert-lead.schema';

const referralCode = () => 'REF' + crypto.randomBytes(3).toString('hex').toUpperCase();

export const convertLeadService = {
  async convert(user: CurrentUser, leadId: string, body: ConvertLeadBody) {
    return prisma.$transaction(async (tx) => {
      // 1. Load the lead and check who may convert it.
      const lead = await tx.lead.findUnique({ where: { id: leadId } });
      if (!lead) throw new AppError(404, 'NOT_FOUND', 'Lead not found');
      if (user.role === 'SALES_REP' && lead.ownerId !== user.id) {
        throw new AppError(403, 'FORBIDDEN', 'You can only convert your own leads');
      }

      // 2. Only a QUALIFIED lead that hasn't been converted yet.
      if (lead.status !== 'QUALIFIED' || lead.convertedContactId) {
        throw new AppError(
          409,
          'LEAD_NOT_QUALIFIED',
          'Only a qualified, unconverted lead can be converted',
        );
      }

      // 3a. Account: use the chosen one, or create a new one.
      let accountId: string;
      if (body.accountId) {
        const account = await tx.account.findUnique({ where: { id: body.accountId } });
        if (!account) throw new AppError(404, 'NOT_FOUND', 'Account not found');
        accountId = account.id;
      } else {
        const account = await tx.account.create({ data: { name: body.accountName! } });
        accountId = account.id;
      }

      // 3b. Contact: reuse an existing contact with the same email instead of failing.
      const email = lead.email.toLowerCase();
      const ownerId = lead.ownerId ?? user.id;
      const existing = await tx.contact.findFirst({ where: { email } });
      const contact =
        existing ??
        (await tx.contact.create({
          data: {
            name: lead.name,
            email,
            phone: lead.phone ?? undefined,
            accountId,
            ownerId,
            referralCode: referralCode(),
          },
        }));
      if (existing && !existing.accountId) {
        await tx.contact.update({ where: { id: existing.id }, data: { accountId } });
      }

      // 3c. Deal (optional), starting in PROSPECTING.
      let dealId: string | null = null;
      if (body.createDeal) {
        if (body.dealValue !== undefined && body.dealValue < 0) {
          // Thrown after the account and contact were created → proves rollback (TC-CONV-06).
          throw new AppError(400, 'INVALID_DEAL_VALUE', 'Deal value cannot be negative');
        }
        const deal = await tx.deal.create({
          data: {
            title: body.dealTitle ?? `${lead.name} deal`,
            value: body.dealValue ?? 0,
            stage: 'PROSPECTING',
            contactId: contact.id,
            accountId,
            ownerId,
          },
        });
        dealId = deal.id;
      }

      // 4. Mark the lead converted. The status check in `where` stops two clicks at the
      //    same moment from converting the same lead twice.
      const updated = await tx.lead.updateMany({
        where: { id: lead.id, status: 'QUALIFIED' },
        data: { status: 'CONVERTED', convertedContactId: contact.id },
      });
      if (updated.count !== 1) {
        throw new AppError(409, 'LEAD_NOT_QUALIFIED', 'This lead was already converted');
      }

      return { contactId: contact.id, accountId, dealId };
    });
  },
};
