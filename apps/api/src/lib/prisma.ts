import { PrismaClient } from '@prisma/client';

/**
 * Single Prisma client for the process. Use the Supabase transaction pooler URL
 * (port 6543, ?pgbouncer=true) for DATABASE_URL in serverless or high-concurrency
 * hosting; migrations use DIRECT_URL.
 */
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  // Business transactions make several round trips; allow for a remote database.
  transactionOptions: { maxWait: 10_000, timeout: 20_000 },
});

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
export type Db = typeof prisma | Tx;
