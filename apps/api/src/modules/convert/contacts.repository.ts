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
};