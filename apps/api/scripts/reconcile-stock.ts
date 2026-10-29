/**
 * Compare cached stock balances with the stock-movement ledger.
 *
 *   pnpm --filter api stock:reconcile            report differences (exit code 2 if any)
 *   pnpm --filter api stock:reconcile -- --repair  rebuild cached balances from the ledger
 */
import { prisma } from '../src/lib/prisma';
import { reconcileBalances } from '../src/services/inventory';

async function main() {
  const repair = process.argv.includes('--repair');
  const discrepancies = await reconcileBalances({ repair });
  if (discrepancies.length === 0) {
    console.log('Stock balances match the movement ledger.');
    return;
  }
  console.table(discrepancies);
  if (repair) {
    console.log(`Repaired ${discrepancies.length} balance row(s) from the ledger.`);
  } else {
    console.log(`${discrepancies.length} balance row(s) differ from the ledger. Re-run with --repair to fix.`);
    process.exitCode = 2;
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
