import { randomUUID } from 'node:crypto';
import { Prisma, type StockMovementType } from '@prisma/client';
import {
  STOCK_ADJUSTMENT_REASON_LABELS,
  toDecimal,
  type stockAdjustmentInputSchema,
  type stockTransferInputSchema,
} from '@tsm/shared';
import type { z } from 'zod';
import type { AuthContext } from '../middleware/auth';
import { AppError } from '../lib/errors';
import { prisma, type Db, type Tx } from '../lib/prisma';
import { recordAudit, type AuditActor } from './audit';
import { assertBranchAccess } from './branch-scope';
import { getCompanySettings } from './company-settings';
import { notifyLowStock } from './notifications';

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
  /**
   * Builds the error raised when the movement would take stock below zero, so callers can
   * name the item, branch and available quantity. Defaults to SHORTAGE_MESSAGE.
   */
  onShortage?: (available: Prisma.Decimal) => AppError;
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
    throw input.onShortage?.(new Prisma.Decimal(balance.quantityOnHand)) ?? new AppError('INVALID_STATE', SHORTAGE_MESSAGE);
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

/* ---------- Adjustments & transfers ---------- */

/**
 * Adjustments and transfers are ledger-only operations: they have no document of their
 * own, so the movements carry a generated reference (ADJ-/TRF-yyyymmdd-xxxxxx) and a
 * shared sourceId that ties the rows of one operation together.
 *
 * Costing: stock value is quantity × weighted average cost of costed inbound movements
 * (see reports). An increase may state a unit cost, which then joins that average; when it
 * doesn't, the stock is valued at the existing average. Decreases and both legs of a
 * transfer carry the item's current average cost (falling back to its purchase cost) for
 * traceability; transfer legs never enter the average, so moving stock between branches
 * leaves company-wide value unchanged.
 */

export type StockAdjustment = z.output<typeof stockAdjustmentInputSchema>;
export type StockTransfer = z.output<typeof stockTransferInputSchema>;

const qty = (d: Prisma.Decimal | string) => new Prisma.Decimal(d).toDecimalPlaces(3).toString();

function operationReference(prefix: 'ADJ' | 'TRF', at = new Date()) {
  const day = at.toISOString().slice(0, 10).replace(/-/g, '');
  return `${prefix}-${day}-${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

/** Current weighted average cost per item, from costed inbound movements. */
async function currentUnitCosts(tx: Tx, items: { id: string; purchaseCost: Prisma.Decimal | null }[]) {
  const result = new Map<string, Prisma.Decimal | null>(items.map((i) => [i.id, i.purchaseCost]));
  if (items.length === 0) return result;
  const rows = await tx.$queryRaw<{ itemId: string; cost: Prisma.Decimal | null }[]>`
    SELECT "itemId", SUM(quantity * "unitCost") / NULLIF(SUM(quantity), 0) AS cost
    FROM stock_movements
    WHERE "unitCost" IS NOT NULL AND quantity > 0
      AND type IN ('opening_balance', 'purchase_receipt', 'adjustment_in')
      AND "itemId" IN (${Prisma.join(items.map((i) => Prisma.sql`${i.id}::uuid`))})
    GROUP BY "itemId"`;
  for (const r of rows ?? []) {
    if (r.cost !== null) result.set(r.itemId, new Prisma.Decimal(r.cost).toDecimalPlaces(2));
  }
  return result;
}

async function activeBranch(tx: Tx, ctx: AuthContext, branchId: string, field: string) {
  assertBranchAccess(ctx, branchId);
  const branch = await tx.branch.findUnique({ where: { id: branchId }, select: { id: true, name: true, isActive: true } });
  if (!branch?.isActive) {
    const message = 'Choose an active branch.';
    throw new AppError('VALIDATION_FAILED', message, { [field]: message });
  }
  return branch;
}

const itemSelect = {
  id: true,
  sku: true,
  name: true,
  unit: true,
  isActive: true,
  approvalStatus: true,
  purchaseCost: true,
} as const;

const MISSING_ITEM = 'This item no longer exists or is awaiting approval. Pick another.';

/**
 * Corrects on-hand stock of one item at one branch, with a reason. Must run inside a
 * transaction; the balance row is locked by recordMovement.
 */
export async function adjustStock(tx: Tx, ctx: AuthContext, actor: AuditActor, input: StockAdjustment) {
  const branch = await activeBranch(tx, ctx, input.branchId, 'branchId');
  const item = await tx.stockItem.findUnique({ where: { id: input.itemId }, select: itemSelect });
  if (!item || item.approvalStatus !== 'approved') {
    throw new AppError('VALIDATION_FAILED', MISSING_ITEM, { itemId: MISSING_ITEM });
  }
  const increase = input.direction === 'increase';
  if (increase && !item.isActive) {
    const message = 'This item is inactive. Reactivate it before adding stock.';
    throw new AppError('VALIDATION_FAILED', message, { itemId: message });
  }

  const reference = operationReference('ADJ');
  const unitCost = increase
    ? (input.unitCost ?? null)
    : ((await currentUnitCosts(tx, [item])).get(item.id) ?? null);
  const reasonLabel = STOCK_ADJUSTMENT_REASON_LABELS[input.reason];
  const note = input.note ? `${reasonLabel}: ${input.note}` : reasonLabel;

  const { movement, quantityOnHand } = await recordMovement(tx, {
    itemId: item.id,
    branchId: branch.id,
    type: increase ? 'adjustment_in' : 'adjustment_out',
    quantity: input.quantity,
    unitCost,
    sourceType: 'stock_adjustment',
    sourceId: randomUUID(),
    reference,
    note,
    actorId: ctx.profileId,
    onShortage: (available) => {
      const message = `There isn't enough stock at ${branch.name} to remove ${qty(input.quantity)} ${item.unit}. Available: ${qty(available)}.`;
      return new AppError('VALIDATION_FAILED', message, { quantity: message });
    },
  });

  await recordAudit(tx, actor, {
    action: 'stock.adjusted',
    entityType: 'stock_item',
    entityId: item.id,
    summary: `Stock ${increase ? 'added' : 'removed'}: ${increase ? '+' : '−'}${qty(input.quantity)} ${item.unit} of ${item.sku} at ${branch.name} (${reasonLabel}) — ${reference}`,
    changes: {
      reference,
      movementId: movement.id,
      branchId: branch.id,
      direction: input.direction,
      quantity: qty(input.quantity),
      reason: input.reason,
      note: input.note ?? null,
      unitCost: unitCost === null ? null : String(unitCost),
      quantityOnHandAfter: qty(quantityOnHand),
    },
  });
  if (!increase) await notifyLowStock(tx, branch.id, [item.id]);
  return { reference, balanceKeys: [{ itemId: item.id, branchId: branch.id }] };
}

/**
 * Moves stock between two branches: a transfer_out at the source and a matching
 * transfer_in at the destination per item, all in the caller's transaction, so the total
 * across branches never changes. The caller must be able to work in both branches.
 */
export async function transferStock(tx: Tx, ctx: AuthContext, actor: AuditActor, input: StockTransfer) {
  if (input.fromBranchId === input.toBranchId) {
    const message = 'Choose a different branch from the one the stock leaves.';
    throw new AppError('VALIDATION_FAILED', message, { toBranchId: message });
  }
  const from = await activeBranch(tx, ctx, input.fromBranchId, 'fromBranchId');
  const to = await activeBranch(tx, ctx, input.toBranchId, 'toBranchId');

  const ids = input.items.map((l) => l.itemId);
  const found = await tx.stockItem.findMany({ where: { id: { in: ids } }, select: itemSelect });
  const items = new Map(found.map((i) => [i.id, i]));
  input.items.forEach((line, index) => {
    const item = items.get(line.itemId);
    if (!item || item.approvalStatus !== 'approved') {
      throw new AppError('VALIDATION_FAILED', MISSING_ITEM, { [`items.${index}.itemId`]: MISSING_ITEM });
    }
  });
  const costs = await currentUnitCosts(tx, found);

  const reference = operationReference('TRF');
  const sourceId = randomUUID();
  const note = input.note ? `${from.name} → ${to.name}: ${input.note}` : `${from.name} → ${to.name}`;
  const occurredAt = new Date();

  // Lock balance rows in one global order (item id, then branch id) so two opposite
  // transfers running at the same time can't deadlock.
  const lines = input.items
    .map((line, index) => ({ ...line, index, item: items.get(line.itemId)! }))
    .sort((a, b) => a.itemId.localeCompare(b.itemId));
  for (const line of lines) {
    const shortage = (available: Prisma.Decimal) => {
      const message = `There isn't enough stock of ${line.item.name} at ${from.name} to transfer ${qty(line.quantity)} ${line.item.unit}. Available: ${qty(available)}.`;
      return new AppError('VALIDATION_FAILED', message, { [`items.${line.index}.quantity`]: message });
    };
    const legs = [
      { branchId: from.id, type: 'transfer_out' as const, onShortage: shortage },
      { branchId: to.id, type: 'transfer_in' as const, onShortage: undefined },
    ].sort((a, b) => a.branchId.localeCompare(b.branchId));
    for (const leg of legs) {
      await recordMovement(tx, {
        itemId: line.itemId,
        branchId: leg.branchId,
        type: leg.type,
        quantity: line.quantity,
        unitCost: costs.get(line.itemId) ?? null,
        sourceType: 'stock_transfer',
        sourceId,
        reference,
        note,
        actorId: ctx.profileId,
        occurredAt,
        onShortage: leg.onShortage,
      });
    }
    await recordAudit(tx, actor, {
      action: 'stock.transferred',
      entityType: 'stock_item',
      entityId: line.itemId,
      summary: `Stock transferred: ${qty(line.quantity)} ${line.item.unit} of ${line.item.sku} from ${from.name} to ${to.name} — ${reference}`,
      changes: {
        reference,
        transferId: sourceId,
        fromBranchId: from.id,
        toBranchId: to.id,
        quantity: qty(line.quantity),
        note: input.note ?? null,
      },
    });
  }
  await notifyLowStock(tx, from.id, ids);
  return {
    reference,
    balanceKeys: lines.flatMap((l) => [
      { itemId: l.itemId, branchId: from.id },
      { itemId: l.itemId, branchId: to.id },
    ]),
  };
}
