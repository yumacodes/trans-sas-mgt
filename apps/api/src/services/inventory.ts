import { Prisma, type StockMovementType } from '@prisma/client';
import { toDecimal } from '@tsm/shared';
import type { AuthContext } from '../middleware/auth';
import { AppError } from '../lib/errors';
import { prisma, type Db, type Tx } from '../lib/prisma';
import { getCompanySettings } from './company-settings';

/**
 * Inventory model
 * - StockMovement is the append-only ledger and the source of truth.
 * - StockBalance caches the running on-hand quantity per item and branch. It is only
 *   ever changed by recordMovement(), in the same transaction as the ledger row, with
 *   the balance row locked (SELECT … FOR UPDATE) so concurrent movements serialise.
 * - reconcileBalances() rebuilds the cache from the ledger and reports differences.
 *
 * Low stock: an active item whose reorder level is above zero and whose on-hand
 * quantity across the branches in scope is at or below that level.
 */

function branchSql(ctx: AuthContext | null, column: Prisma.Sql) {
  if (!ctx || ctx.allBranches) return Prisma.sql`TRUE`;
  if (ctx.branchIds.length === 0) return Prisma.sql`FALSE`;
  return Prisma.sql`${column} IN (${Prisma.join(ctx.branchIds.map((id) => Prisma.sql`${id}::uuid`))})`;
}

/** On-hand totals per item over the branches visible to the caller. */
export async function quantitiesByItem(db: Db, ctx: AuthContext, itemIds: string[]) {
  const result = new Map<string, Prisma.Decimal>();
  if (itemIds.length === 0) return result;
  const rows = await db.stockBalance.groupBy({
    by: ['itemId'],
    where: {
      itemId: { in: itemIds },
      ...(ctx.allBranches ? {} : { branchId: { in: [...ctx.branchIds] } }),
    },
    _sum: { quantityOnHand: true },
  });
  for (const row of rows) result.set(row.itemId, row._sum.quantityOnHand ?? new Prisma.Decimal(0));
  return result;
}

export function isLowStock(quantity: Prisma.Decimal | null | undefined, reorderLevel: number, isActive = true) {
  return isActive && reorderLevel > 0 && toDecimal(quantity?.toString() ?? 0).lte(reorderLevel);
}

/** Ids of low-stock items within the caller's branch scope. */
export async function lowStockItemIds(db: Db, ctx: AuthContext | null): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT i.id
    FROM stock_items i
    LEFT JOIN stock_balances b
      ON b."itemId" = i.id AND ${branchSql(ctx, Prisma.sql`b."branchId"`)}
    WHERE i."isActive" = TRUE AND i."reorderLevel" > 0
    GROUP BY i.id, i."reorderLevel"
    HAVING COALESCE(SUM(b."quantityOnHand"), 0) <= i."reorderLevel"`;
  return rows.map((r) => r.id);
}

/** Ids of balance rows at or below their item's reorder level within scope. */
export async function lowStockBalanceIds(db: Db, ctx: AuthContext): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT b.id
    FROM stock_balances b
    JOIN stock_items i ON i.id = b."itemId"
    WHERE i."isActive" = TRUE AND i."reorderLevel" > 0
      AND b."quantityOnHand" <= i."reorderLevel"
      AND ${branchSql(ctx, Prisma.sql`b."branchId"`)}`;
  return rows.map((r) => r.id);
}

const INBOUND: StockMovementType[] = ['opening_balance', 'purchase_receipt', 'sale_return', 'adjustment_in', 'transfer_in'];

export interface MovementInput {
  itemId: string;
  branchId: string;
  type: StockMovementType;
  /** Positive magnitude; the sign is derived from the movement type. */
  quantity: Prisma.Decimal | string;
  unitCost?: Prisma.Decimal | string | null;
  sourceType?: string;
  sourceId?: string;
  reference?: string;
  note?: string;
  actorId: string | null;
  occurredAt?: Date;
}

export const SHORTAGE_MESSAGE =
  "There isn't enough stock available to complete this transaction. Review the available quantity before continuing.";

/**
 * Append a ledger movement and update the cached balance atomically. Must be called
 * inside a transaction. Rejects movements that would take on-hand stock below zero
 * unless the company settings allow negative stock.
 */
export async function recordMovement(tx: Tx, input: MovementInput) {
  const magnitude = new Prisma.Decimal(input.quantity);
  if (magnitude.lte(0)) throw new AppError('VALIDATION_FAILED', 'Quantity must be greater than zero.');
  const signed = INBOUND.includes(input.type) ? magnitude : magnitude.neg();

  await tx.$executeRaw`
    INSERT INTO stock_balances (id, "itemId", "branchId", "quantityOnHand", "quantityReserved", "updatedAt")
    VALUES (gen_random_uuid(), ${input.itemId}::uuid, ${input.branchId}::uuid, 0, 0, now())
    ON CONFLICT ("itemId", "branchId") DO NOTHING`;
  const [balance] = await tx.$queryRaw<{ id: string; quantityOnHand: Prisma.Decimal }[]>`
    SELECT id, "quantityOnHand" FROM stock_balances
    WHERE "itemId" = ${input.itemId}::uuid AND "branchId" = ${input.branchId}::uuid
    FOR UPDATE`;
  if (!balance) throw new Error('stock balance row missing after upsert');

  const next = new Prisma.Decimal(balance.quantityOnHand).plus(signed);
  if (next.lt(0) && !(await getCompanySettings(tx)).allowNegativeStock) {
    throw new AppError('INVALID_STATE', SHORTAGE_MESSAGE);
  }

  const movement = await tx.stockMovement.create({
    data: {
      itemId: input.itemId,
      branchId: input.branchId,
      type: input.type,
      quantity: signed,
      unitCost: input.unitCost ?? null,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      reference: input.reference,
      note: input.note,
      actorId: input.actorId,
      occurredAt: input.occurredAt,
    },
  });
  await tx.stockBalance.update({ where: { id: balance.id }, data: { quantityOnHand: next } });
  return { movement, quantityOnHand: next };
}

export interface BalanceDiscrepancy {
  itemId: string;
  branchId: string;
  cached: string;
  ledger: string;
}

/** Compare cached balances with ledger totals; optionally repair the cache. */
export async function reconcileBalances({ repair = false } = {}): Promise<BalanceDiscrepancy[]> {
  const rows = await prisma.$queryRaw<
    { itemId: string; branchId: string; cached: Prisma.Decimal | null; ledger: Prisma.Decimal | null }[]
  >`
    WITH ledger AS (
      SELECT "itemId", "branchId", SUM(quantity) AS total FROM stock_movements GROUP BY 1, 2
    )
    SELECT COALESCE(b."itemId", l."itemId") AS "itemId",
           COALESCE(b."branchId", l."branchId") AS "branchId",
           b."quantityOnHand" AS cached,
           l.total AS ledger
    FROM stock_balances b
    FULL OUTER JOIN ledger l ON l."itemId" = b."itemId" AND l."branchId" = b."branchId"
    WHERE COALESCE(b."quantityOnHand", 0) <> COALESCE(l.total, 0)`;

  const discrepancies = rows.map((r) => ({
    itemId: r.itemId,
    branchId: r.branchId,
    cached: (r.cached ?? new Prisma.Decimal(0)).toFixed(3),
    ledger: (r.ledger ?? new Prisma.Decimal(0)).toFixed(3),
  }));
  if (repair && discrepancies.length) {
    await prisma.$transaction(async (tx) => {
      for (const d of discrepancies) {
        await tx.stockBalance.upsert({
          where: { itemId_branchId: { itemId: d.itemId, branchId: d.branchId } },
          create: { itemId: d.itemId, branchId: d.branchId, quantityOnHand: d.ledger },
          update: { quantityOnHand: d.ledger },
        });
      }
    });
  }
  return discrepancies;
}
