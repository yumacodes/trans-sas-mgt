import { Router } from 'express';
import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import {
  uuid,
  waybillDeliverSchema,
  waybillInputSchema,
  waybillListQuerySchema,
  type WaybillDto,
} from '@tsm/shared';
import { getAuth, requirePermission, type AuthContext } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { AppError, invalidState, notFound } from '../lib/errors';
import { orderBy, pageMeta, pageWindow } from '../lib/pagination';
import { prisma, type Db, type Tx } from '../lib/prisma';
import { created, ok } from '../lib/respond';
import { dateFromIso, decimalString, iso, isoDateOnly, optionalIso } from '../lib/serialize';
import { parse } from '../lib/validate';
import { actorFrom, recordAudit } from '../services/audit';
import {
  assertBranchAccess,
  branchGuard,
  branchWhere,
  canAccessBranch,
  resolveDocumentBranch,
} from '../services/branch-scope';
import { nextDocumentNumber, peekDocumentNumber } from '../services/document-numbers';
import { recordMovement } from '../services/inventory';
import { notify, notifyLowStock } from '../services/notifications';
import { pdfCompany } from '../services/pdf-company';
import { documentEmailRoute } from '../services/document-email';
import { assertStockItemsExist, customerOptions, resolveClient, stockItemOptions } from '../services/pickers';
import { renderWaybillPdf } from '../services/waybill-pdf';

/**
 * Waybills separate three events: created (draft), goods left (dispatched), goods arrived
 * (delivered). A waybill linked to a sale never moves stock, because confirming the sale
 * already did. A waybill with no sale issues its stock at dispatch and returns it if cancelled.
 */
export const waybillsRouter = Router();

const include = {
  items: { orderBy: { position: 'asc' as const } },
  createdBy: { select: { fullName: true } },
  branch: { select: { id: true, code: true, name: true } },
  sale: { select: { id: true, number: true } },
} satisfies Prisma.WaybillInclude;

type WaybillRow = Prisma.WaybillGetPayload<{ include: typeof include }>;
type Input = z.output<typeof waybillInputSchema>;

function toDto(w: WaybillRow): WaybillDto {
  return {
    id: w.id,
    number: w.number,
    branch: w.branch,
    sale: w.sale,
    clientId: w.clientId,
    recipientName: w.recipientName,
    deliveryAddress: w.deliveryAddress,
    deliveryDate: isoDateOnly(w.deliveryDate),
    carrier: w.carrier,
    vehicleNumber: w.vehicleNumber,
    receivedBy: w.receivedBy,
    notes: w.notes,
    status: w.status,
    stockIssued: w.stockIssued,
    dispatchedAt: optionalIso(w.dispatchedAt),
    deliveredAt: optionalIso(w.deliveredAt),
    itemCount: w.items.length,
    items: w.items.map((i) => ({
      id: i.id,
      saleItemId: i.saleItemId,
      stockItemId: i.stockItemId,
      name: i.name,
      quantity: decimalString(i.quantity, 3),
      unit: i.unit,
    })),
    preparedBy: w.createdBy.fullName.trim(),
    createdAt: iso(w.createdAt),
    updatedAt: iso(w.updatedAt),
  };
}

async function loadWaybill(db: Db, id: string): Promise<WaybillRow> {
  const row = await db.waybill.findUnique({ where: { id }, include });
  if (!row) throw notFound('The waybill');
  return row;
}

/** Quantity of each sale line already on waybills that aren't cancelled. */
async function deliveredBySaleLine(tx: Tx, saleId: string, exceptWaybillId?: string) {
  const rows = await tx.waybillItem.findMany({
    where: {
      saleItemId: { not: null },
      waybill: { saleId, status: { not: 'cancelled' }, ...(exceptWaybillId ? { id: { not: exceptWaybillId } } : {}) },
    },
    select: { saleItemId: true, quantity: true },
  });
  const totals = new Map<string, Prisma.Decimal>();
  for (const r of rows) {
    const key = r.saleItemId!;
    totals.set(key, (totals.get(key) ?? new Prisma.Decimal(0)).plus(r.quantity));
  }
  return totals;
}

/** Checks a sale-linked waybill against the sale, holding a lock so two can't over-deliver. */
async function checkAgainstSale(tx: Tx, ctx: AuthContext, input: Input, exceptWaybillId?: string) {
  const saleId = input.saleId!;
  await tx.$queryRaw`SELECT id FROM sales WHERE id = ${saleId}::uuid FOR UPDATE`;
  const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { items: true } });
  if (!sale || !canAccessBranch(ctx, sale.branchId)) throw notFound('The sale');
  if (sale.status !== 'confirmed') throw invalidState('A waybill can only be made for a confirmed sale.');
  const already = await deliveredBySaleLine(tx, saleId, exceptWaybillId);
  const lines = new Map(sale.items.map((i) => [i.id, i]));
  const onThisWaybill = new Map<string, Prisma.Decimal>();
  for (const item of input.items) {
    const line = item.saleItemId ? lines.get(item.saleItemId) : undefined;
    if (!line) {
      const message = `${item.name} isn't on this sale. Remove it or make a separate waybill.`;
      throw new AppError('VALIDATION_FAILED', message, { items: message });
    }
    const total = (onThisWaybill.get(line.id) ?? new Prisma.Decimal(0)).plus(item.quantity);
    onThisWaybill.set(line.id, total);
    const remaining = new Prisma.Decimal(line.quantity).minus(already.get(line.id) ?? 0);
    if (total.gt(remaining)) {
      const message = `Only ${remaining.toString()} ${line.unit} of ${line.name} is left to deliver on this sale.`;
      throw new AppError('VALIDATION_FAILED', message, { items: message });
    }
  }
  return sale;
}

function headerFields(input: Input) {
  return {
    recipientName: input.recipientName,
    deliveryAddress: input.deliveryAddress ?? null,
    deliveryDate: dateFromIso(input.deliveryDate),
    carrier: input.carrier ?? null,
    vehicleNumber: input.vehicleNumber ?? null,
    notes: input.notes ?? null,
  };
}

function itemRows(input: Input) {
  return input.items.map((item, position) => ({
    position,
    saleItemId: item.saleItemId ?? null,
    stockItemId: item.stockItemId ?? null,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
  }));
}

waybillsRouter.use(requirePermission('waybills.read'));
waybillsRouter.param(
  'id',
  branchGuard('The waybill', (id) => prisma.waybill.findUnique({ where: { id }, select: { branchId: true } })),
);

waybillsRouter.get('/next-number', requirePermission('waybills.manage'), async (_req, res) => {
  ok(res, { number: await peekDocumentNumber(prisma, 'waybill') });
});
waybillsRouter.get('/customers', requirePermission('waybills.manage'), async (req, res) => {
  ok(res, await customerOptions(req));
});
waybillsRouter.get('/items', requirePermission('waybills.manage'), async (req, res) => {
  ok(res, await stockItemOptions(req));
});

waybillsRouter.get('/', async (req, res) => {
  const ctx = getAuth(req);
  const query = parse(waybillListQuerySchema, req.query);
  if (query.branchId) assertBranchAccess(ctx, query.branchId);
  const and: Prisma.WaybillWhereInput[] = [branchWhere(ctx)];
  if (query.branchId) and.push({ branchId: query.branchId });
  if (query.status) and.push({ status: query.status });
  if (query.dateFrom) and.push({ deliveryDate: { gte: dateFromIso(query.dateFrom) } });
  if (query.dateTo) and.push({ deliveryDate: { lte: dateFromIso(query.dateTo) } });
  if (query.q) {
    and.push({
      OR: [
        { number: { contains: query.q, mode: 'insensitive' } },
        { recipientName: { contains: query.q, mode: 'insensitive' } },
        { sale: { number: { contains: query.q, mode: 'insensitive' } } },
      ],
    });
  }
  const where: Prisma.WaybillWhereInput = { AND: and };
  const sort = orderBy<Prisma.WaybillOrderByWithRelationInput[]>(
    query.sort,
    {
      number: (dir) => [{ number: dir }],
      deliveryDate: (dir) => [{ deliveryDate: dir }, { number: dir }],
      recipientName: (dir) => [{ recipientName: dir }],
      status: (dir) => [{ status: dir }],
    },
    [{ deliveryDate: 'desc' }, { number: 'desc' }],
  );
  const [rows, total] = await Promise.all([
    prisma.waybill.findMany({ where, orderBy: sort, include, ...pageWindow(query) }),
    prisma.waybill.count({ where }),
  ]);
  ok(res, rows.map(toDto), pageMeta(query, total));
});

waybillsRouter.get('/:id', async (req, res) => {
  ok(res, toDto(await loadWaybill(prisma, parse(uuid, req.params.id))));
});

waybillsRouter.get('/:id/pdf', async (req, res) => {
  const waybill = toDto(await loadWaybill(prisma, parse(uuid, req.params.id)));
  const pdf = await renderWaybillPdf(waybill, await pdfCompany('Waybill'));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${waybill.number}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
});

waybillsRouter.post(
  '/:id/email',
  ...documentEmailRoute({
    permission: 'waybills.manage',
    entityType: 'waybill',
    load: async (id) => {
      const waybill = toDto(await loadWaybill(prisma, id));
      return {
        number: waybill.number,
        recipientName: waybill.recipientName,
        pdf: async () => renderWaybillPdf(waybill, await pdfCompany('Waybill')),
      };
    },
  }),
);

waybillsRouter.post('/', requirePermission('waybills.manage'), idempotent, async (req, res) => {
  const ctx = getAuth(req);
  const input = parse(waybillInputSchema, req.body);
  const row = await prisma.$transaction(async (tx) => {
    await assertStockItemsExist(tx, input.items.map((i) => i.stockItemId));
    const sale = input.saleId ? await checkAgainstSale(tx, ctx, input) : null;
    const branchId = sale?.branchId ?? (await resolveDocumentBranch(tx, ctx, input.branchId));
    if (!branchId) throw invalidState('Add a branch under Admin > Branches before making waybills.');
    const clientId =
      sale?.clientId ??
      (await resolveClient(
        tx,
        req,
        ctx,
        { clientId: input.clientId, name: input.recipientName, address: input.deliveryAddress },
        'waybill',
      ));
    const waybill = await tx.waybill.create({
      data: {
        ...headerFields(input),
        number: await nextDocumentNumber(tx, 'waybill', { date: dateFromIso(input.deliveryDate) }),
        branchId,
        saleId: sale?.id ?? null,
        clientId,
        createdById: ctx.profileId,
        items: { create: itemRows(input) },
      },
      include,
    });
    await recordAudit(tx, actorFrom(req), {
      action: 'waybill.created',
      entityType: 'waybill',
      entityId: waybill.id,
      summary: `Waybill ${waybill.number} created for ${waybill.recipientName}`,
    });
    return waybill;
  });
  created(res, toDto(row));
});

waybillsRouter.put('/:id', requirePermission('waybills.manage'), async (req, res) => {
  const ctx = getAuth(req);
  const id = parse(uuid, req.params.id);
  const input = parse(waybillInputSchema, req.body);
  const row = await prisma.$transaction(async (tx) => {
    const before = await loadWaybill(tx, id);
    if (before.status !== 'draft') throw invalidState('Only draft waybills can be edited.');
    await assertStockItemsExist(tx, input.items.map((i) => i.stockItemId));
    // A waybill can't be moved onto or off a sale after it is made.
    const linked: Input = { ...input, saleId: before.saleId };
    if (before.saleId) await checkAgainstSale(tx, ctx, linked, id);
    const claimed = await tx.waybill.updateMany({ where: { id, status: 'draft' }, data: headerFields(input) });
    if (claimed.count === 0) throw invalidState('This waybill was just changed. Reopen it and try again.');
    await tx.waybillItem.deleteMany({ where: { waybillId: id } });
    await tx.waybillItem.createMany({ data: itemRows(input).map((i) => ({ ...i, waybillId: id })) });
    await recordAudit(tx, actorFrom(req), {
      action: 'waybill.updated',
      entityType: 'waybill',
      entityId: id,
      summary: `Waybill ${before.number} updated`,
    });
    return loadWaybill(tx, id);
  });
  ok(res, toDto(row));
});

waybillsRouter.post('/:id/dispatch', requirePermission('waybills.manage'), async (req, res) => {
  const ctx = getAuth(req);
  const id = parse(uuid, req.params.id);
  const row = await prisma.$transaction(async (tx) => {
    const before = await loadWaybill(tx, id);
    if (before.status === 'dispatched') return before; // A retry must not issue stock twice.
    if (before.status !== 'draft') throw invalidState('Only a draft waybill can be dispatched.');
    const issuesStock = !before.saleId && before.items.some((i) => i.stockItemId);
    const claimed = await tx.waybill.updateMany({
      where: { id, status: 'draft' },
      data: { status: 'dispatched', dispatchedAt: new Date(), stockIssued: issuesStock },
    });
    if (claimed.count === 0) return loadWaybill(tx, id);
    if (issuesStock) {
      for (const line of before.items) {
        if (!line.stockItemId) continue;
        await recordMovement(tx, {
          itemId: line.stockItemId,
          branchId: before.branchId,
          type: 'sale_issue',
          quantity: line.quantity,
          sourceType: 'waybill',
          sourceId: id,
          reference: before.number,
          actorId: ctx.profileId,
        });
      }
    }
    await recordAudit(tx, actorFrom(req), {
      action: 'waybill.dispatched',
      entityType: 'waybill',
      entityId: id,
      summary: `Waybill ${before.number} dispatched${issuesStock ? ' and its stock issued' : ''}`,
    });
    if (issuesStock) {
      await notifyLowStock(tx, before.branchId, before.items.map((i) => i.stockItemId).filter((v): v is string => Boolean(v)));
    }
    return loadWaybill(tx, id);
  });
  ok(res, toDto(row));
});

waybillsRouter.post('/:id/deliver', requirePermission('waybills.manage'), async (req, res) => {
  const ctx = getAuth(req);
  const id = parse(uuid, req.params.id);
  const { receivedBy } = parse(waybillDeliverSchema, req.body);
  const row = await prisma.$transaction(async (tx) => {
    const before = await loadWaybill(tx, id);
    if (before.status === 'delivered') return before;
    if (before.status !== 'dispatched') throw invalidState('Only a dispatched waybill can be marked delivered.');
    const claimed = await tx.waybill.updateMany({
      where: { id, status: 'dispatched' },
      data: { status: 'delivered', deliveredAt: new Date(), receivedBy },
    });
    if (claimed.count === 0) return loadWaybill(tx, id);
    await recordAudit(tx, actorFrom(req), {
      action: 'waybill.delivered',
      entityType: 'waybill',
      entityId: id,
      summary: `Waybill ${before.number} delivered, received by ${receivedBy}`,
    });
    await notify(tx, before.createdById === ctx.profileId ? [] : [before.createdById], {
      type: 'delivery',
      title: `Waybill ${before.number} was delivered`,
      body: `Received by ${receivedBy}`,
      link: `/waybills?open=${id}`,
      dedupeKey: `delivered:${id}`,
    });
    return loadWaybill(tx, id);
  });
  ok(res, toDto(row));
});

waybillsRouter.post('/:id/cancel', requirePermission('waybills.manage'), async (req, res) => {
  const ctx = getAuth(req);
  const id = parse(uuid, req.params.id);
  const row = await prisma.$transaction(async (tx) => {
    const before = await loadWaybill(tx, id);
    if (before.status === 'cancelled') return before;
    if (before.status === 'delivered') throw invalidState('A delivered waybill cannot be cancelled.');
    const claimed = await tx.waybill.updateMany({
      where: { id, status: before.status },
      data: { status: 'cancelled', stockIssued: false },
    });
    if (claimed.count === 0) throw invalidState('This waybill was just changed. Reopen it and try again.');
    if (before.stockIssued) {
      for (const line of before.items) {
        if (!line.stockItemId) continue;
        await recordMovement(tx, {
          itemId: line.stockItemId,
          branchId: before.branchId,
          type: 'sale_return',
          quantity: line.quantity,
          sourceType: 'waybill',
          sourceId: id,
          reference: before.number,
          actorId: ctx.profileId,
        });
      }
    }
    await recordAudit(tx, actorFrom(req), {
      action: 'waybill.cancelled',
      entityType: 'waybill',
      entityId: id,
      summary: `Waybill ${before.number} cancelled`,
    });
    return loadWaybill(tx, id);
  });
  ok(res, toDto(row));
});

/** Draft waybill for whatever is left to deliver on a confirmed sale. */
waybillsRouter.post('/from-sale/:saleId', requirePermission('waybills.manage'), async (req, res) => {
  const ctx = getAuth(req);
  const saleId = parse(uuid, req.params.saleId);
  const row = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM sales WHERE id = ${saleId}::uuid FOR UPDATE`;
    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    if (!sale || !canAccessBranch(ctx, sale.branchId)) throw notFound('The sale');
    if (sale.status !== 'confirmed') throw invalidState('A waybill can only be made for a confirmed sale.');
    const already = await deliveredBySaleLine(tx, saleId);
    const lines = sale.items
      .map((i) => ({ line: i, remaining: new Prisma.Decimal(i.quantity).minus(already.get(i.id) ?? 0) }))
      .filter((l) => l.remaining.gt(0));
    if (lines.length === 0) throw invalidState('Everything on this sale is already on a waybill.');
    const waybill = await tx.waybill.create({
      data: {
        number: await nextDocumentNumber(tx, 'waybill'),
        branchId: sale.branchId,
        saleId,
        clientId: sale.clientId,
        recipientName: sale.customerName,
        deliveryAddress: sale.customerAddress,
        deliveryDate: new Date(new Date().toISOString().slice(0, 10)),
        createdById: ctx.profileId,
        items: {
          create: lines.map(({ line, remaining }, position) => ({
            position,
            saleItemId: line.id,
            stockItemId: line.stockItemId,
            name: line.name,
            quantity: remaining,
            unit: line.unit,
          })),
        },
      },
      include,
    });
    await recordAudit(tx, actorFrom(req), {
      action: 'waybill.created',
      entityType: 'waybill',
      entityId: waybill.id,
      summary: `Waybill ${waybill.number} created from sale ${sale.number}`,
    });
    return waybill;
  });
  created(res, toDto(row));
});
