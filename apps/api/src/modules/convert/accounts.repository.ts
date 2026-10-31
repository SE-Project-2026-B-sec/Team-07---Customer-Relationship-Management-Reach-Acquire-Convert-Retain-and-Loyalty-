// CRM-11: Prisma queries for accounts.
import { Prisma } from '@prisma/client';
import { prisma } from '../../common/prisma';

export const accountsRepository = {
  findMany(where: Prisma.AccountWhereInput, skip: number, take: number) {
    return prisma.account.findMany({
      where,
      skip,
      take,
      orderBy: { name: 'asc' },
      include: { _count: { select: { contacts: true } } },
    });
  },

  count(where: Prisma.AccountWhereInput) {
    return prisma.account.count({ where });
  },

  // contactWhere lets the service limit a rep to their own contacts on the detail page.
  findById(id: string, contactWhere: Prisma.ContactWhereInput) {
    return prisma.account.findUnique({
      where: { id },
      include: {
        contacts: {
          where: contactWhere,
          orderBy: { name: 'asc' },
          select: { id: true, name: true, email: true, phone: true, city: true },
        },
      },
    });
  },

  create(data: Prisma.AccountUncheckedCreateInput) {
    return prisma.account.create({ data });
  },

  update(id: string, data: Prisma.AccountUncheckedUpdateInput) {
    return prisma.account.update({ where: { id }, data });
  },

  exists(id: string) {
    return prisma.account.findUnique({ where: { id }, select: { id: true } });
  },

  // Unlink contacts first so the delete doesn't fail on the foreign key.
  delete(id: string) {
    return prisma.$transaction([
      prisma.contact.updateMany({ where: { accountId: id }, data: { accountId: null } }),
      prisma.account.delete({ where: { id } }),
    ]);
  },
};
