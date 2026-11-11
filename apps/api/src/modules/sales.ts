import { Router } from 'express';
import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import {
  calculateProformaTotals,
  saleCancelSchema,
  saleInputSchema,
  saleListQuerySchema,
  uuid,
  type ProformaDto,
  type SaleDto,
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
import {
  assertBranchAccess,
  branchGuard,
  branchWhere,
  canAccessBranch,
  resolveDocumentBranch,
} from '../services/branch-scope';
import { nextDocumentNumber, peekDocumentNumber } from '../services/document-numbers';
import { recordMovement } from '../services/inventory';
import { pdfCompany } from '../services/pdf-company';
import { assertStockItemsExist, customerOptions, resolveClient, stockItemOptions } from '../services/pickers';
import { renderProformaPdf } from '../services/proforma-pdf';

/**
 * Sales. A draft changes nothing. Confirming a sale issues its stock in the same
 * transaction, once; cancelling a confirmed sale returns it. Balances are always computed
 * from posted payments, never stored.
 */
export const salesRouter = Router();

export const saleInclude = {
  items: { orderBy: { position: 'asc' as const } },
  createdBy: { select: { fullName: true } },
  branch: { select: { id: true, code: true, name: true } },
  proforma: { select: { id: true, number: true } },
  tender: { select: { id: true, number: true } },
  payments: { where: { status: 'posted' as const }, select: { amount: true } },
} satisfies Prisma.SaleInclude;

type SaleRow = Prisma.SaleGetPayload<{ include: typeof saleInclude }>;

export function saleBalance(total: Prisma.Decimal, payments: { amount: Prisma.Decimal }[]) {
  const paid = payments.reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0));
  return { paid, balance: new Prisma.Decimal(total).minus(paid) };
}

function toDto(s: SaleRow): SaleDto {
  const { paid, balance } = saleBalance(s.total, s.payments);
  return {
    id: s.id,
    number: s.number,
    saleDate: isoDateOnly(s.saleDate),
    dueDate: optionalIsoDateOnly(s.dueDate),
    currency: s.currency as SaleDto['currency'],
    branch: s.branch,
    clientId: s.clientId,
    customerName: s.customerName,
    customerAddress: s.customerAddress,
    customerEmail: s.customerEmail,
    customerPhone: s.customerPhone,
    taxRate: decimalString(s.taxRate),
    subtotal: decimalString(s.subtotal),
    taxAmount: decimalString(s.taxAmount),
    total: decimalString(s.total),
    paidAmount: decimalString(paid),
    balance: decimalString(balance),
    notes: s.notes,
    status: s.status,
    cancelReason: s.cancelReason,
    proforma: s.proforma,
    tender: s.tender,
    itemCount: s.items.length,
    items: s.items.map((i) => ({
      id: i.id,
      stockItemId: i.stockItemId,
      name: i.name,
      quantity: decimalString(i.quantity, 3),
      unit: i.unit,
      unitPrice: decimalString(i.unitPrice),
      amount: decimalString(i.amount),
    })),
    preparedBy: s.createdBy.fullName.trim(),
    createdAt: iso(s.createdAt),
    updatedAt: iso(s.updatedAt),
  };
}

async function loadSale(db: Db, id: string): Promise<SaleRow> {
  const row = await db.sale.findUnique({ where: { id }, include: saleInclude });
  if (!row) throw notFound('The sale');
  return row;
}

function fields(input: z.output<typeof saleInputSchema>) {
  const totals = calculateProformaTotals(input.items, 0, input.taxRate);
  return {
    data: {
      saleDate: dateFromIso(input.saleDate),
      dueDate: input.dueDate ? dateFromIso(input.dueDate) : null,
      currency: input.currency,
      customerName: input.customerName,
      customerAddress: input.customerAddress ?? null,
      customerEmail: input.customerEmail ?? null,
      customerPhone: input.customerPhone ?? null,
      taxRate: input.taxRate,
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      total: totals.total,
      notes: input.notes ?? null,
    },
    items: input.items.map((item, position) => ({
      position,
      stockItemId: item.stockItemId ?? null,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      amount: totals.amounts[position]!,
    })),
    totals,
  };
}

salesRouter.use(requirePermission('sales.read'));
salesRouter.param(
  'id',
  branchGuard('The sale', (id) => prisma.sale.findUnique({ where: { id }, select: { branchId: true } })),
);

salesRouter.get('/next-number', requirePermission('sales.manage'), async (_req, res) => {
  ok(res, { number: await peekDocumentNumber(prisma, 'sale') });
});
salesRouter.get('/customers', requirePermission('sales.manage'), async (req, res) => {
  ok(res, await customerOptions(req));
});
salesRouter.get('/items', requirePermission('sales.manage'), async (req, res) => {
  ok(res, await stockItemOptions(req));
});

salesRouter.get('/', async (req, res) => {
  const ctx = getAuth(req);
  const query = parse(saleListQuerySchema, req.query);
  if (query.branchId) assertBranchAccess(ctx, query.branchId);
  const and: Prisma.SaleWhereInput[] = [branchWhere(ctx)];
  if (query.branchId) and.push({ branchId: query.branchId });
  if (query.status) and.push({ status: query.status });
  if (query.dateFrom) and.push({ saleDate: { gte: dateFromIso(query.dateFrom) } });
  if (query.dateTo) and.push({ saleDate: { lte: dateFromIso(query.dateTo) } });
  if (query.q) {
    and.push({
      OR: [
        { number: { contains: query.q, mode: 'insensitive' } },
        { customerName: { contains: query.q, mode: 'insensitive' } },
      ],
    });
  }
  const where: Prisma.SaleWhereInput = { AND: and };
  const sort = orderBy<Prisma.SaleOrderByWithRelationInput[]>(
    query.sort,
    {
      number: (dir) => [{ number: dir }],
      saleDate: (dir) => [{ saleDate: dir }, { number: dir }],
      customerName: (dir) => [{ customerName: dir }],
      total: (dir) => [{ total: dir }],
      status: (dir) => [{ status: dir }],
    },
    [{ saleDate: 'desc' }, { number: 'desc' }],
  );
  const [rows, total] = await Promise.all([
    prisma.sale.findMany({ where, orderBy: sort, include: saleInclude, ...pageWindow(query) }),
    prisma.sale.count({ where }),
  ]);
  ok(res, rows.map(toDto), pageMeta(query, total));
});

salesRouter.get('/:id', async (req, res) => {
  ok(res, toDto(await loadSale(prisma, parse(uuid, req.params.id))));
});

salesRouter.get('/:id/pdf', async (req, res) => {
  const sale = toDto(await loadSale(prisma, parse(uuid, req.params.id)));
  // A sale invoice has the same layout as a proforma, under its own heading.
  const asDocument: ProformaDto = {
    ...sale,
    issueDate: sale.saleDate,
    vatRate: '0',
    vatAmount: '0.00',
    status: 'issued',
    emailedAt: null,
    preparedByName: sale.preparedBy,
  };
  const pdf = await renderProformaPdf(asDocument, await pdfCompany('Invoice'), {
    heading: 'SALES',
    subheading: 'INVOICE',
    documentTitle: 'Sales Invoice',
    statusLabel: sale.status === 'confirmed' ? 'Confirmed' : sale.status === 'draft' ? 'Draft' : 'Cancelled',
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${sale.number}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
});

salesRouter.post('/', requirePermission('sales.manage'), idempotent, async (req, res) => {
  const ctx = getAuth(req);
  const input = parse(saleInputSchema, req.body);
  const { data, items, totals } = fields(input);
  const row = await prisma.$transaction(async (tx) => {
    await assertStockItemsExist(tx, input.items.map((i) => i.stockItemId));
    const branchId = await requireBranch(tx, ctx, input.branchId);
    const clientId = await resolveClient(
      tx,
      req,
      ctx,
      {
        clientId: input.clientId,
        name: input.customerName,
        address: input.customerAddress,
        email: input.customerEmail,
        phone: input.customerPhone,
      },
      'sale',
    );
    const sale = await tx.sale.create({
      data: {
        ...data,
        number: await nextDocumentNumber(tx, 'sale', { date: dateFromIso(input.saleDate) }),
        branchId,
        clientId,
        createdById: ctx.profileId,
        items: { create: items },
      },
      include: saleInclude,
    });
    await recordAudit(tx, actorFrom(req), {
      action: 'sale.created',
      entityType: 'sale',
      entityId: sale.id,
      summary: `Sale ${sale.number} drafted for ${sale.customerName} (${input.currency} ${totals.total})`,
    });
    return sale;
  });
  created(res, toDto(row));
});

async function requireBranch(tx: Tx, ctx: AuthContext, requested: string | null | undefined) {
  const branchId = await resolveDocumentBranch(tx, ctx, requested);
  if (!branchId) {
    const message = 'Add a branch under Admin > Branches before recording sales.';
    throw new AppError('VALIDATION_FAILED', message, { branchId: message });
  }
  return branchId;
}

salesRouter.put('/:id', requirePermission('sales.manage'), async (req, res) => {
  const ctx = getAuth(req);
  const id = parse(uuid, req.params.id);
  const input = parse(saleInputSchema, req.body);
  const { data, items } = fields(input);
  const row = await prisma.$transaction(async (tx) => {
    const before = await loadSale(tx, id);
    if (before.status !== 'draft') throw invalidState('Only draft sales can be edited.');
    await assertStockItemsExist(tx, input.items.map((i) => i.stockItemId));
    const clientId = await resolveClient(
      tx,
      req,
      ctx,
      {
        clientId: input.clientId,
        name: input.customerName,
        address: input.customerAddress,
        email: input.customerEmail,
        phone: input.customerPhone,
      },
      'sale',
    );
    const branchId = input.branchId ? await requireBranch(tx, ctx, input.branchId) : before.branchId;
    // Guards against the sale being confirmed between the read above and this write.
    const claimed = await tx.sale.updateMany({ where: { id, status: 'draft' }, data: { ...data, clientId, branchId } });
    if (claimed.count === 0) throw invalidState('This sale was just confirmed or cancelled. Reopen it to see its status.');
    await tx.saleItem.deleteMany({ where: { saleId: id } });
    await tx.saleItem.createMany({ data: items.map((item) => ({ ...item, saleId: id })) });
    await recordAudit(tx, actorFrom(req), {
      action: 'sale.updated',
      entityType: 'sale',
      entityId: id,
      summary: `Sale ${before.number} updated`,
    });
    return loadSale(tx, id);
  });
  ok(res, toDto(row));
});

salesRouter.post('/:id/confirm', requirePermission('sales.manage'), async (req, res) => {
  const ctx = getAuth(req);
  const id = parse(uuid, req.params.id);
  const row = await prisma.$transaction(async (tx) => {
    const before = await loadSale(tx, id);
    if (before.status === 'confirmed') return before; // A retry must not issue stock twice.
    if (before.status !== 'draft') throw invalidState('A cancelled sale cannot be confirmed.');
    const claimed = await tx.sale.updateMany({
      where: { id, status: 'draft' },
      data: { status: 'confirmed', confirmedAt: new Date() },
    });
    if (claimed.count === 0) return loadSale(tx, id);

    const stockIds = before.items.map((i) => i.stockItemId).filter((v): v is string => Boolean(v));
    const stock = await tx.stockItem.findMany({
      where: { id: { in: stockIds } },
      select: { id: true, name: true, isActive: true, purchaseCost: true },
    });
    const byId = new Map(stock.map((s) => [s.id, s]));
    for (const line of before.items) {
      if (!line.stockItemId) continue;
      const item = byId.get(line.stockItemId);
      if (!item?.isActive) throw invalidState(`${line.name} is no longer active, so it can't be sold.`);
      await recordMovement(tx, {
        itemId: line.stockItemId,
        branchId: before.branchId,
        type: 'sale_issue',
        quantity: line.quantity,
        // Captured now so cost of goods sold stays fixed if the item's cost changes later.
        unitCost: item.purchaseCost,
        sourceType: 'sale',
        sourceId: id,
        reference: before.number,
        actorId: ctx.profileId,
      });
    }
    await recordAudit(tx, actorFrom(req), {
      action: 'sale.confirmed',
      entityType: 'sale',
      entityId: id,
      summary: `Sale ${before.number} confirmed and its stock issued`,
    });
    return loadSale(tx, id);
  });
  ok(res, toDto(row));
});

salesRouter.post('/:id/cancel', requirePermission('sales.cancel'), async (req, res) => {
  const ctx = getAuth(req);
  const id = parse(uuid, req.params.id);
  const { reason } = parse(saleCancelSchema, req.body);
  const row = await prisma.$transaction(async (tx) => {
    const before = await loadSale(tx, id);
    if (before.status === 'cancelled') return before;
    if (before.payments.length > 0) {
      throw invalidState('This sale has payments. Reverse them before cancelling it.');
    }
    const openWaybills = await tx.waybill.count({ where: { saleId: id, status: { not: 'cancelled' } } });
    if (openWaybills > 0) throw invalidState('This sale has waybills. Cancel them before cancelling the sale.');
    const claimed = await tx.sale.updateMany({
      where: { id, status: before.status },
      data: { status: 'cancelled', cancelReason: reason },
    });
    if (claimed.count === 0) throw invalidState('This sale was just changed. Reopen it and try again.');
    if (before.status === 'confirmed') {
      for (const line of before.items) {
        if (!line.stockItemId) continue;
        await recordMovement(tx, {
          itemId: line.stockItemId,
          branchId: before.branchId,
          type: 'sale_return',
          quantity: line.quantity,
          sourceType: 'sale',
          sourceId: id,
          reference: before.number,
          note: reason,
          actorId: ctx.profileId,
        });
      }
    }
    await recordAudit(tx, actorFrom(req), {
      action: 'sale.cancelled',
      entityType: 'sale',
      entityId: id,
      summary: `Sale ${before.number} cancelled: ${reason}`,
    });
    return loadSale(tx, id);
  });
  ok(res, toDto(row));
});

/* ---------- One-click conversions ---------- */

const ALREADY_SOLD = 'A sale already exists for this document. Open it from the Sales page.';

salesRouter.post('/from-proforma/:proformaId', requirePermission('sales.manage'), async (req, res) => {
  const ctx = getAuth(req);
  const proformaId = parse(uuid, req.params.proformaId);
  const row = await prisma.$transaction(async (tx) => {
    const source = await tx.proforma.findUnique({
      where: { id: proformaId },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    if (!source || !canAccessBranch(ctx, source.branchId)) throw notFound('The proforma');
    if (source.status !== 'accepted') throw invalidState('Only an accepted proforma can become a sale.');
    if (await tx.sale.count({ where: { proformaId, status: { not: 'cancelled' } } })) throw invalidState(ALREADY_SOLD);
    const sale = await tx.sale.create({
      data: {
        number: await nextDocumentNumber(tx, 'sale'),
        saleDate: new Date(new Date().toISOString().slice(0, 10)),
        currency: source.currency,
        branchId: source.branchId ?? (await requireBranch(tx, ctx, null)),
        clientId: source.clientId,
        customerName: source.customerName,
        customerAddress: source.customerAddress,
        customerEmail: source.customerEmail,
        customerPhone: source.customerPhone,
        taxRate: source.taxRate,
        subtotal: source.subtotal,
        taxAmount: new Prisma.Decimal(source.taxAmount).plus(source.vatAmount),
        total: source.total,
        notes: source.notes,
        proformaId,
        createdById: ctx.profileId,
        items: {
          create: source.items.map((i) => ({
            position: i.position,
            stockItemId: i.stockItemId,
            name: i.name,
            quantity: i.quantity,
            unit: i.unit,
            unitPrice: i.unitPrice,
            amount: i.amount,
          })),
        },
      },
      include: saleInclude,
    });
    await recordAudit(tx, actorFrom(req), {
      action: 'sale.created',
      entityType: 'sale',
      entityId: sale.id,
      summary: `Sale ${sale.number} created from proforma ${source.number}`,
    });
    return sale;
  });
  created(res, toDto(row));
});

salesRouter.post('/from-tender/:tenderId', requirePermission('sales.manage'), async (req, res) => {
  const ctx = getAuth(req);
  const tenderId = parse(uuid, req.params.tenderId);
  const row = await prisma.$transaction(async (tx) => {
    const source = await tx.tender.findUnique({
      where: { id: tenderId },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    if (!source || !canAccessBranch(ctx, source.branchId)) throw notFound('The price schedule');
    if (source.status !== 'awarded') throw invalidState('Only an awarded price schedule can become a sale.');
    if (await tx.sale.count({ where: { tenderId, status: { not: 'cancelled' } } })) throw invalidState(ALREADY_SOLD);
    const sale = await tx.sale.create({
      data: {
        number: await nextDocumentNumber(tx, 'sale'),
        saleDate: new Date(new Date().toISOString().slice(0, 10)),
        currency: source.currency,
        branchId: source.branchId ?? (await requireBranch(tx, ctx, null)),
        clientId: source.clientId,
        customerName: source.customerName,
        customerAddress: source.customerAddress,
        taxRate: source.taxRate,
        subtotal: source.subtotal,
        taxAmount: source.taxAmount,
        total: source.total,
        notes: source.notes,
        tenderId,
        createdById: ctx.profileId,
        items: {
          create: source.items.map((i) => ({
            position: i.position,
            stockItemId: i.stockItemId,
            name: i.description,
            quantity: i.quantity,
            unit: i.unit,
            unitPrice: i.unitPrice,
            amount: i.amount,
          })),
        },
      },
      include: saleInclude,
    });
    await recordAudit(tx, actorFrom(req), {
      action: 'sale.created',
      entityType: 'sale',
      entityId: sale.id,
      summary: `Sale ${sale.number} created from price schedule ${source.number}`,
    });
    return sale;
  });
  created(res, toDto(row));
});
