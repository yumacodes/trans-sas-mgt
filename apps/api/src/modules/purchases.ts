import { Router } from 'express';
import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import {
  calculateProformaTotals,
  purchaseInputSchema,
  purchaseListQuerySchema,
  purchaseReceiveSchema,
  purchaseReorderSchema,
  uuid,
  type ProformaDto,
  type PurchaseDto,
} from '@tsm/shared';
import { getAuth, requirePermission, type AuthContext } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { AppError, invalidState, notFound } from '../lib/errors';
import { orderBy, pageMeta, pageWindow } from '../lib/pagination';
import { prisma, type Db, type Tx } from '../lib/prisma';
import { created, ok } from '../lib/respond';
import { dateFromIso, decimalString, iso, isoDateOnly, optionalIsoDateOnly } from '../lib/serialize';
import { parse } from '../lib/validate';
import { actorFrom, recordAudit } from '../services/audit';
import { assertBranchAccess, branchGuard, branchWhere, resolveDocumentBranch } from '../services/branch-scope';
import { nextDocumentNumber, peekDocumentNumber } from '../services/document-numbers';
import { recordMovement } from '../services/inventory';
import { notifyPermission } from '../services/notifications';
import { pdfCompany } from '../services/pdf-company';
import { documentEmailRoute } from '../services/document-email';
import { assertStockItemsExist, stockItemOptions } from '../services/pickers';
import { renderProformaPdf } from '../services/proforma-pdf';

/**
 * Purchases. Lifecycle: draft (editable) → ordered → partly received → received, or
 * cancelled while nothing has arrived. Stock rises only through a goods receipt, which
 * records the movement and the received quantity in one transaction.
 */
export const purchasesRouter = Router();

const include = {
  items: { orderBy: { position: 'asc' as const } },
  supplier: { select: { id: true, code: true, name: true, address: true, email: true, phone: true } },
  branch: { select: { id: true, code: true, name: true } },
  createdBy: { select: { fullName: true } },
  receipts: {
    orderBy: { createdAt: 'asc' as const },
    include: { createdBy: { select: { fullName: true } }, lines: { include: { purchaseItem: true } } },
  },
} satisfies Prisma.PurchaseInclude;

type PurchaseRow = Prisma.PurchaseGetPayload<{ include: typeof include }>;

function toDto(p: PurchaseRow): PurchaseDto {
  return {
    id: p.id,
    number: p.number,
    branch: p.branch,
    supplier: { id: p.supplier.id, code: p.supplier.code, name: p.supplier.name },
    purchaseDate: isoDateOnly(p.purchaseDate),
    expectedDate: optionalIsoDateOnly(p.expectedDate),
    supplierReference: p.supplierReference,
    currency: p.currency as PurchaseDto['currency'],
    taxRate: decimalString(p.taxRate),
    subtotal: decimalString(p.subtotal),
    taxAmount: decimalString(p.taxAmount),
    total: decimalString(p.total),
    notes: p.notes,
    status: p.status,
    itemCount: p.items.length,
    items: p.items.map((i) => ({
      id: i.id,
      stockItemId: i.stockItemId,
      name: i.name,
      quantity: decimalString(i.quantity, 3),
      receivedQuantity: decimalString(i.receivedQuantity, 3),
      unit: i.unit,
      unitCost: decimalString(i.unitCost),
      amount: decimalString(i.amount),
    })),
    receipts: p.receipts.map((r) => ({
      id: r.id,
      receivedDate: isoDateOnly(r.receivedDate),
      note: r.note,
      receivedBy: r.createdBy.fullName.trim(),
      lines: r.lines.map((l) => ({ name: l.purchaseItem.name, quantity: decimalString(l.quantity, 3), unit: l.purchaseItem.unit })),
      createdAt: iso(r.createdAt),
    })),
    preparedBy: p.createdBy.fullName.trim(),
    createdAt: iso(p.createdAt),
    updatedAt: iso(p.updatedAt),
  };
}

async function loadPurchase(db: Db, id: string): Promise<PurchaseRow> {
  const row = await db.purchase.findUnique({ where: { id }, include });
  if (!row) throw notFound('The purchase');
  return row;
}

async function activeSupplier(tx: Tx, supplierId: string) {
  const supplier = await tx.supplier.findUnique({ where: { id: supplierId }, select: { isActive: true } });
  if (!supplier?.isActive) {
    const message = 'Choose an active supplier.';
    throw new AppError('VALIDATION_FAILED', message, { supplierId: message });
  }
}

async function requireBranch(tx: Tx, ctx: AuthContext, requested: string | null | undefined) {
  const branchId = await resolveDocumentBranch(tx, ctx, requested);
  if (!branchId) {
    const message = 'Add a branch under Admin > Branches before recording purchases.';
    throw new AppError('VALIDATION_FAILED', message, { branchId: message });
  }
  return branchId;
}

function fields(input: z.output<typeof purchaseInputSchema>) {
  const totals = calculateProformaTotals(
    input.items.map((i) => ({ quantity: i.quantity, unitPrice: i.unitCost })),
    0,
    input.taxRate,
  );
  return {
    data: {
      supplierId: input.supplierId,
      purchaseDate: dateFromIso(input.purchaseDate),
      expectedDate: input.expectedDate ? dateFromIso(input.expectedDate) : null,
      supplierReference: input.supplierReference ?? null,
      currency: input.currency,
      taxRate: input.taxRate,
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      total: totals.total,
      notes: input.notes ?? null,
    },
    items: input.items.map((item, position) => ({
      position,
      stockItemId: item.stockItemId,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      unitCost: item.unitCost,
      amount: totals.amounts[position]!,
    })),
    totals,
  };
}

purchasesRouter.use(requirePermission('purchases.read'));
purchasesRouter.param(
  'id',
  branchGuard('The purchase', (id) => prisma.purchase.findUnique({ where: { id }, select: { branchId: true } })),
);

purchasesRouter.get('/next-number', requirePermission('purchases.manage'), async (_req, res) => {
  ok(res, { number: await peekDocumentNumber(prisma, 'purchase') });
});
purchasesRouter.get('/items', requirePermission('purchases.manage'), async (req, res) => {
  ok(res, await stockItemOptions(req));
});

purchasesRouter.get('/', async (req, res) => {
  const ctx = getAuth(req);
  const query = parse(purchaseListQuerySchema, req.query);
  if (query.branchId) assertBranchAccess(ctx, query.branchId);
  const and: Prisma.PurchaseWhereInput[] = [branchWhere(ctx)];
  if (query.branchId) and.push({ branchId: query.branchId });
  if (query.status) and.push({ status: query.status });
  if (query.supplierId) and.push({ supplierId: query.supplierId });
  if (query.dateFrom) and.push({ purchaseDate: { gte: dateFromIso(query.dateFrom) } });
  if (query.dateTo) and.push({ purchaseDate: { lte: dateFromIso(query.dateTo) } });
  if (query.q) {
    and.push({
      OR: [
        { number: { contains: query.q, mode: 'insensitive' } },
        { supplierReference: { contains: query.q, mode: 'insensitive' } },
        { supplier: { name: { contains: query.q, mode: 'insensitive' } } },
      ],
    });
  }
  const where: Prisma.PurchaseWhereInput = { AND: and };
  const sort = orderBy<Prisma.PurchaseOrderByWithRelationInput[]>(
    query.sort,
    {
      number: (dir) => [{ number: dir }],
      purchaseDate: (dir) => [{ purchaseDate: dir }, { number: dir }],
      total: (dir) => [{ total: dir }],
      status: (dir) => [{ status: dir }],
    },
    [{ purchaseDate: 'desc' }, { number: 'desc' }],
  );
  const [rows, total] = await Promise.all([
    prisma.purchase.findMany({ where, orderBy: sort, include, ...pageWindow(query) }),
    prisma.purchase.count({ where }),
  ]);
  ok(res, rows.map(toDto), pageMeta(query, total));
});

purchasesRouter.get('/:id', async (req, res) => {
  ok(res, toDto(await loadPurchase(prisma, parse(uuid, req.params.id))));
});

async function purchasePdf(row: PurchaseRow) {
  const p = toDto(row);
  // A purchase order uses the invoice layout, with the supplier in the customer's place.
  const asDocument: ProformaDto = {
    id: p.id,
    branch: p.branch,
    number: p.number,
    issueDate: p.purchaseDate,
    currency: p.currency,
    clientId: null,
    customerName: row.supplier.name,
    customerAddress: row.supplier.address,
    customerEmail: row.supplier.email,
    customerPhone: row.supplier.phone,
    vatRate: '0',
    taxRate: p.taxRate,
    subtotal: p.subtotal,
    vatAmount: '0.00',
    taxAmount: p.taxAmount,
    total: p.total,
    notes: p.notes,
    status: 'issued',
    emailedAt: null,
    itemCount: p.itemCount,
    items: p.items.map((i) => ({
      id: i.id,
      stockItemId: i.stockItemId,
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      unitPrice: i.unitCost,
      amount: i.amount,
    })),
    preparedBy: p.preparedBy,
    preparedByName: p.preparedBy,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
  return renderProformaPdf(asDocument, await pdfCompany('Purchase Order'), {
    heading: 'PURCHASE',
    subheading: 'ORDER',
    documentTitle: 'Purchase Order',
    statusLabel: p.status === 'draft' ? 'Draft' : 'Ordered',
  });
}

purchasesRouter.get('/:id/pdf', async (req, res) => {
  const row = await loadPurchase(prisma, parse(uuid, req.params.id));
  const pdf = await purchasePdf(row);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${row.number}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
});

purchasesRouter.post(
  '/:id/email',
  ...documentEmailRoute({
    permission: 'purchases.manage',
    entityType: 'purchase',
    load: async (id) => {
      const row = await loadPurchase(prisma, id);
      return { number: row.number, recipientName: row.supplier.name, pdf: () => purchasePdf(row) };
    },
  }),
);

purchasesRouter.post('/', requirePermission('purchases.manage'), idempotent, async (req, res) => {
  const ctx = getAuth(req);
  const input = parse(purchaseInputSchema, req.body);
  const { data, items, totals } = fields(input);
  const row = await prisma.$transaction(async (tx) => {
    await activeSupplier(tx, input.supplierId);
    await assertStockItemsExist(tx, input.items.map((i) => i.stockItemId));
    const purchase = await tx.purchase.create({
      data: {
        ...data,
        number: await nextDocumentNumber(tx, 'purchase', { date: dateFromIso(input.purchaseDate) }),
        branchId: await requireBranch(tx, ctx, input.branchId),
        createdById: ctx.profileId,
        items: { create: items },
      },
      include,
    });
    await recordAudit(tx, actorFrom(req), {
      action: 'purchase.created',
      entityType: 'purchase',
      entityId: purchase.id,
      summary: `Purchase ${purchase.number} drafted with ${purchase.supplier.name} (${input.currency} ${totals.total})`,
    });
    return purchase;
  });
  created(res, toDto(row));
});

purchasesRouter.put('/:id', requirePermission('purchases.manage'), async (req, res) => {
  const ctx = getAuth(req);
  const id = parse(uuid, req.params.id);
  const input = parse(purchaseInputSchema, req.body);
  const { data, items } = fields(input);
  const row = await prisma.$transaction(async (tx) => {
    const before = await loadPurchase(tx, id);
    if (before.status !== 'draft') throw invalidState('Only draft purchases can be edited.');
    await activeSupplier(tx, input.supplierId);
    await assertStockItemsExist(tx, input.items.map((i) => i.stockItemId));
    const branchId = input.branchId ? await requireBranch(tx, ctx, input.branchId) : before.branchId;
    const claimed = await tx.purchase.updateMany({ where: { id, status: 'draft' }, data: { ...data, branchId } });
    if (claimed.count === 0) throw invalidState('This purchase was just ordered or cancelled. Reopen it to see its status.');
    await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });
    await tx.purchaseItem.createMany({ data: items.map((i) => ({ ...i, purchaseId: id })) });
    await recordAudit(tx, actorFrom(req), {
      action: 'purchase.updated',
      entityType: 'purchase',
      entityId: id,
      summary: `Purchase ${before.number} updated`,
    });
    return loadPurchase(tx, id);
  });
  ok(res, toDto(row));
});

purchasesRouter.post('/:id/order', requirePermission('purchases.manage'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  const row = await prisma.$transaction(async (tx) => {
    const before = await loadPurchase(tx, id);
    if (before.status !== 'draft') return before;
    const claimed = await tx.purchase.updateMany({ where: { id, status: 'draft' }, data: { status: 'ordered' } });
    if (claimed.count > 0) {
      await recordAudit(tx, actorFrom(req), {
        action: 'purchase.ordered',
        entityType: 'purchase',
        entityId: id,
        summary: `Purchase ${before.number} ordered from ${before.supplier.name}`,
      });
    }
    return loadPurchase(tx, id);
  });
  ok(res, toDto(row));
});

purchasesRouter.post('/:id/cancel', requirePermission('purchases.manage'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  const row = await prisma.$transaction(async (tx) => {
    const before = await loadPurchase(tx, id);
    if (before.status === 'cancelled') return before;
    if (before.status !== 'draft' && before.status !== 'ordered') {
      throw invalidState('Goods have already been received on this purchase, so it cannot be cancelled.');
    }
    const claimed = await tx.purchase.updateMany({
      where: { id, status: { in: ['draft', 'ordered'] } },
      data: { status: 'cancelled' },
    });
    if (claimed.count === 0) throw invalidState('This purchase was just changed. Reopen it and try again.');
    await recordAudit(tx, actorFrom(req), {
      action: 'purchase.cancelled',
      entityType: 'purchase',
      entityId: id,
      summary: `Purchase ${before.number} cancelled`,
    });
    return loadPurchase(tx, id);
  });
  ok(res, toDto(row));
});

/** Goods arrived: stock rises by what was received, never more than was ordered. */
purchasesRouter.post('/:id/receive', requirePermission('purchases.receive'), idempotent, async (req, res) => {
  const ctx = getAuth(req);
  const id = parse(uuid, req.params.id);
  const input = parse(purchaseReceiveSchema, req.body);
  const row = await prisma.$transaction(async (tx) => {
    // Locked so two people receiving the same delivery can't both count it.
    await tx.$queryRaw`SELECT id FROM purchases WHERE id = ${id}::uuid FOR UPDATE`;
    const before = await loadPurchase(tx, id);
    if (before.status !== 'ordered' && before.status !== 'partially_received') {
      throw invalidState('Goods can only be received on an ordered purchase.');
    }
    const lines = new Map(before.items.map((i) => [i.id, i]));
    const received = new Map<string, Prisma.Decimal>();
    for (const entry of input.items) {
      const line = lines.get(entry.purchaseItemId);
      if (!line) throw new AppError('VALIDATION_FAILED', 'One of the lines is not on this purchase.', { items: 'One of the lines is not on this purchase.' });
      const total = (received.get(line.id) ?? new Prisma.Decimal(0)).plus(entry.quantity);
      const remaining = new Prisma.Decimal(line.quantity).minus(line.receivedQuantity);
      if (total.gt(remaining)) {
        const message = `Only ${remaining.toString()} ${line.unit} of ${line.name} is still due.`;
        throw new AppError('VALIDATION_FAILED', message, { items: message });
      }
      received.set(line.id, total);
    }

    const receipt = await tx.goodsReceipt.create({
      data: {
        purchaseId: id,
        branchId: before.branchId,
        receivedDate: dateFromIso(input.receivedDate),
        note: input.note ?? null,
        createdById: ctx.profileId,
        lines: { create: [...received].map(([purchaseItemId, quantity]) => ({ purchaseItemId, quantity })) },
      },
    });
    for (const [lineId, quantity] of received) {
      const line = lines.get(lineId)!;
      await recordMovement(tx, {
        itemId: line.stockItemId,
        branchId: before.branchId,
        type: 'purchase_receipt',
        quantity,
        unitCost: line.unitCost,
        sourceType: 'goods_receipt',
        sourceId: receipt.id,
        reference: before.number,
        actorId: ctx.profileId,
        occurredAt: dateFromIso(input.receivedDate),
      });
      await tx.purchaseItem.update({
        where: { id: lineId },
        data: { receivedQuantity: new Prisma.Decimal(line.receivedQuantity).plus(quantity) },
      });
    }
    const complete = before.items.every((i) =>
      new Prisma.Decimal(i.receivedQuantity).plus(received.get(i.id) ?? 0).gte(i.quantity),
    );
    await tx.purchase.update({ where: { id }, data: { status: complete ? 'received' : 'partially_received' } });
    await recordAudit(tx, actorFrom(req), {
      action: 'purchase.received',
      entityType: 'purchase',
      entityId: id,
      summary: `Goods received on purchase ${before.number}${complete ? ' (complete)' : ' (partial)'}`,
    });
    return loadPurchase(tx, id);
  });
  ok(res, toDto(row));
});

/** Draft purchase for a branch's low-stock items, topping each up to twice its reorder level. */
purchasesRouter.post('/reorder', requirePermission('purchases.manage'), idempotent, async (req, res) => {
  const ctx = getAuth(req);
  const input = parse(purchaseReorderSchema, req.body);
  const row = await prisma.$transaction(async (tx) => {
    await activeSupplier(tx, input.supplierId);
    const branchId = await requireBranch(tx, ctx, input.branchId);
    const low = await tx.$queryRaw<
      { id: string; name: string; unit: string; reorderLevel: number; cost: Prisma.Decimal | null; onHand: Prisma.Decimal }[]
    >`
      SELECT i.id, i.name, i.unit, i."reorderLevel", i."purchaseCost" AS cost,
             COALESCE(b."quantityOnHand", 0) AS "onHand"
      FROM stock_items i
      LEFT JOIN stock_balances b ON b."itemId" = i.id AND b."branchId" = ${branchId}::uuid
      WHERE i."isActive" = TRUE AND i."approvalStatus" = 'approved' AND i."reorderLevel" > 0
        AND COALESCE(b."quantityOnHand", 0) <= i."reorderLevel"
      ORDER BY i.name
      LIMIT 200`;
    if (low.length === 0) throw invalidState('Nothing at this branch is at or below its reorder level.');
    const lines = low.map((i) => {
      const target = new Prisma.Decimal(i.reorderLevel).times(2).minus(i.onHand);
      return {
        stockItemId: i.id,
        name: i.name,
        quantity: (target.gt(0) ? target : new Prisma.Decimal(1)).toFixed(3),
        unit: i.unit,
        unitCost: new Prisma.Decimal(i.cost ?? 0).toFixed(2),
      };
    });
    const { data, items } = fields({
      supplierId: input.supplierId,
      purchaseDate: new Date().toISOString().slice(0, 10),
      currency: 'GHS',
      taxRate: '0',
      items: lines,
    } as z.output<typeof purchaseInputSchema>);
    const purchase = await tx.purchase.create({
      data: {
        ...data,
        number: await nextDocumentNumber(tx, 'purchase'),
        branchId,
        notes: 'Drafted from the low-stock list. Check quantities and costs before ordering.',
        createdById: ctx.profileId,
        items: { create: items },
      },
      include,
    });
    await recordAudit(tx, actorFrom(req), {
      action: 'purchase.created',
      entityType: 'purchase',
      entityId: purchase.id,
      summary: `Purchase ${purchase.number} drafted from ${lines.length} low-stock item(s)`,
    });
    await notifyPermission(tx, 'purchases.manage', branchId, ctx.profileId, {
      type: 'purchase_draft',
      title: `Purchase ${purchase.number} drafted for low stock`,
      link: '/purchases',
      dedupeKey: `reorder:${purchase.id}`,
    });
    return purchase;
  });
  created(res, toDto(row));
});
