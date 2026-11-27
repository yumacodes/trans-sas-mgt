import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import {
  stockAdjustmentInputSchema,
  stockBalanceListQuerySchema,
  stockTransferInputSchema,
  type StockBalanceDto,
  type StockOperationResultDto,
} from '@tsm/shared';
import { getAuth, requireAnyPermission, requirePermission } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { orderBy, pageMeta, pageWindow } from '../lib/pagination';
import { prisma, type Tx } from '../lib/prisma';
import { ok } from '../lib/respond';
import { iso } from '../lib/serialize';
import { parse } from '../lib/validate';
import { assertBranchAccess, branchWhere } from '../services/branch-scope';
import { actorFrom } from '../services/audit';
import { adjustStock, isLowStock, lowStockBalanceIds, transferStock } from '../services/inventory';
import { stockItemOptions } from '../services/pickers';

export const stockBalancesRouter = Router();

export const balanceInclude = {
  item: {
    select: { id: true, sku: true, name: true, unit: true, reorderLevel: true, isActive: true },
  },
  branch: { select: { id: true, code: true, name: true } },
} as const;

type Row = Prisma.StockBalanceGetPayload<{ include: typeof balanceInclude }>;

export function toBalanceDto(b: Row): StockBalanceDto {
  const { isActive, ...item } = b.item;
  return {
    id: b.id,
    item,
    branch: b.branch,
    quantityOnHand: b.quantityOnHand.toFixed(3),
    quantityReserved: b.quantityReserved.toFixed(3),
    quantityAvailable: b.quantityOnHand.minus(b.quantityReserved).toFixed(3),
    isLowStock: isLowStock(b.quantityOnHand, b.item.reorderLevel, isActive),
    updatedAt: iso(b.updatedAt),
  };
}

stockBalancesRouter.get('/', requirePermission('inventory.read'), async (req, res) => {
  const ctx = getAuth(req);
  const query = parse(stockBalanceListQuerySchema, req.query);
  if (query.branchId) assertBranchAccess(ctx, query.branchId);
  const and: Prisma.StockBalanceWhereInput[] = [branchWhere(ctx)];
  if (query.branchId) and.push({ branchId: query.branchId });
  if (query.itemId) and.push({ itemId: query.itemId });
  if (query.categoryId) and.push({ item: { categoryId: query.categoryId } });
  if (query.lowStock) and.push({ id: { in: await lowStockBalanceIds(prisma, ctx) } });
  if (query.q) {
    and.push({
      OR: [
        { item: { sku: { contains: query.q, mode: 'insensitive' } } },
        { item: { name: { contains: query.q, mode: 'insensitive' } } },
      ],
    });
  }
  const where: Prisma.StockBalanceWhereInput = { AND: and };
  const sort = orderBy<Prisma.StockBalanceOrderByWithRelationInput>(
    query.sort,
    {
      item: (dir) => ({ item: { name: dir } }),
      sku: (dir) => ({ item: { sku: dir } }),
      branch: (dir) => ({ branch: { name: dir } }),
      quantityOnHand: (dir) => ({ quantityOnHand: dir }),
      // Reservations are not recorded yet, so available equals on hand.
      available: (dir) => ({ quantityOnHand: dir }),
      updatedAt: (dir) => ({ updatedAt: dir }),
    },
    { item: { name: 'asc' } },
  );
  const [rows, total] = await Promise.all([
    prisma.stockBalance.findMany({
      where,
      orderBy: sort,
      include: balanceInclude,
      ...pageWindow(query),
    }),
    prisma.stockBalance.count({ where }),
  ]);
  ok(res, rows.map(toBalanceDto), pageMeta(query, total));
});

/* ---------- Adjustments & transfers ---------- */

async function loadBalances(tx: Tx, keys: { itemId: string; branchId: string }[]) {
  const rows = await tx.stockBalance.findMany({
    where: { OR: keys.map((k) => ({ itemId: k.itemId, branchId: k.branchId })) },
    include: balanceInclude,
  });
  return rows.map(toBalanceDto);
}

/** Approved, active items for the adjustment and transfer pickers. */
stockBalancesRouter.get(
  '/items',
  requireAnyPermission('inventory.adjust', 'inventory.transfer'),
  async (req, res) => {
    ok(res, await stockItemOptions(req));
  },
);

/** Correct one item's on-hand stock at a branch, with a reason (ledger: adjustment_in/out). */
stockBalancesRouter.post(
  '/adjustments',
  requirePermission('inventory.adjust'),
  idempotent,
  async (req, res) => {
    const ctx = getAuth(req);
    const input = parse(stockAdjustmentInputSchema, req.body);
    const result = await prisma.$transaction(async (tx) => {
      const { reference, balanceKeys } = await adjustStock(tx, ctx, actorFrom(req), input);
      return { reference, balances: await loadBalances(tx, balanceKeys) };
    });
    ok<StockOperationResultDto>(res, result, undefined, 201);
  },
);

/** Move stock between two branches (ledger: transfer_out + transfer_in, shared reference). */
stockBalancesRouter.post(
  '/transfers',
  requirePermission('inventory.transfer'),
  idempotent,
  async (req, res) => {
    const ctx = getAuth(req);
    const input = parse(stockTransferInputSchema, req.body);
    const result = await prisma.$transaction(async (tx) => {
      const { reference, balanceKeys } = await transferStock(tx, ctx, actorFrom(req), input);
      return { reference, balances: await loadBalances(tx, balanceKeys) };
    });
    ok<StockOperationResultDto>(res, result, undefined, 201);
  },
);
