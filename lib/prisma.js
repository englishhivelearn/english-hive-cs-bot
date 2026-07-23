const { PrismaClient } = require('@prisma/client');

// Prevents creating too many Prisma Client instances during Next.js hot-reload / dev
const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
