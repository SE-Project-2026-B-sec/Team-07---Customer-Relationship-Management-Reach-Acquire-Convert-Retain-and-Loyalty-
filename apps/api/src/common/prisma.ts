import { PrismaClient } from '@prisma/client';

// One shared client for the whole API. Modules import this through their repository files.
export const prisma = new PrismaClient();
