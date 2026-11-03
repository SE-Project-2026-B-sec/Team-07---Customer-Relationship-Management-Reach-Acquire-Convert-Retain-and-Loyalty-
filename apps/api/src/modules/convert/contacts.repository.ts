// CRM-11: Prisma queries for contacts. No business rules here — those live in contacts.service.ts.
import { Prisma } from '@prisma/client';
import { prisma } from '../../common/prisma';

export const contactsRepository = {
  findMany(where: Prisma.ContactWhereInput, skip: number, take: number) {
    return prisma.contact.findMany({
      where,
      skip,
      take,
      orderBy: { name: 'asc' },
      include: { account: { select: { id: true, name: true } } },
    });
  },

  count(where: Prisma.ContactWhereInput) {
    return prisma.contact.count({ where });
  },

  findById(id: string) {
    return prisma.contact.findUnique({ where: { id }, include: { account: true } });
  },

  // Emails are stored lower-case (the schema lower-cases them), so an exact match is enough.
  findByEmail(email: string) {
    return prisma.contact.findFirst({ where: { email } });
  },

  findByReferralCode(referralCode: string) {
    return prisma.contact.findFirst({ where: { referralCode } });
  },

  create(data: Prisma.ContactUncheckedCreateInput) {
    return prisma.contact.create({ data, include: { account: true } });
  },

  update(id: string, data: Prisma.ContactUncheckedUpdateInput) {
    return prisma.contact.update({ where: { id }, data, include: { account: true } });
  },

  delete(id: string) {
    return prisma.contact.delete({ where: { id } });
  },

  /**
   * CRM-32 (CRM-SR-007, DPDP Act): erases a contact's personal data while keeping the business
   * records (deals, orders, tickets, points) that point at it. Also wipes the lead the contact was
   * converted from and their campaign history. Returns the ids of the leads that were wiped.
   */
  async anonymise(id: string) {
    return prisma.$transaction(async (tx) => {
      await tx.contact.update({
        where: { id },
        data: {
          name: 'Deleted customer',
          email: `deleted-${id}@deleted.invalid`,
          phone: null,
          city: null,
          tags: [],
          marketingConsent: false,
          isChurnRisk: false,
        },
      });
      await tx.campaignEvent.deleteMany({ where: { contactId: id } });
      const leads = await tx.lead.findMany({
        where: { convertedContactId: id },
        select: { id: true },
      });
      for (const lead of leads) {
        await tx.lead.update({
          where: { id: lead.id },
          data: {
            name: 'Deleted customer',
            email: `deleted-${lead.id}@deleted.invalid`,
            phone: null,
            company: null,
          },
        });
      }
      return leads.map((l) => l.id);
    });
  },

  /** Replaces audit details that still hold the erased person's data (CRM-31 audit log). */
  scrubAudit(entity: 'Contact' | 'Lead', ids: string[]) {
    return prisma.auditLog.updateMany({
      where: { entity, entityId: { in: ids } },
      data: { diffJson: { erased: 'Personal data erased on request (DPDP Act 2023)' } },
    });
  },

  /** One audit line saying who erased the record and when (the details stay empty). */
  logErasure(id: string, userId: string) {
    return prisma.auditLog.create({
      data: {
        userId,
        entity: 'Contact',
        entityId: id,
        action: 'DELETE',
        diffJson: { anonymised: true },
      },
    });
  },
};
