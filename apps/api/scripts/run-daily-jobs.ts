/** Runs the daily jobs once, by hand: pnpm --filter api jobs:daily */
import { runDailyJobs } from '../src/services/jobs';
import { prisma } from '../src/lib/prisma';

const results = await runDailyJobs();
console.log(results);
await prisma.$disconnect();
