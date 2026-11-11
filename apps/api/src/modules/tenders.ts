import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import {
  amountInWords,
  calculateTenderTotals,
  TENDER_STATUS_LABELS,
  tenderInputSchema,
  tenderListQuerySchema,
  tenderStatusSchema,
  uuid,
  type TenderDto,
} from '@tsm/shared';
import type { z } from 'zod';
import { getAuth, requirePermission } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { invalidState, notFound } from '../lib/errors';
import { orderBy, pageMeta, pageWindow } from '../lib/pagination';
import { prisma, type Db } from '../lib/prisma';
import { created, ok } from '../lib/respond';
import { dateFromIso, decimalString, iso, isoDateOnly, optionalIsoDateOnly } from '../lib/serialize';
import { parse } from '../lib/validate';
import { actorFrom, recordAudit } from '../services/audit';
import { assertBranchAccess, branchGuard, optionalBranchWhere, resolveDocumentBranch } from '../services/branch-scope';
import { nextDocumentNumber, peekDocumentNumber } from '../services/document-numbers';
import { pdfCompany } from '../services/pdf-company';
import { assertStockItemsExist, customerOptions, resolveClient, stockItemOptions } from '../services/pickers';
import { renderTenderPdf } from '../services/tender-pdf';

/**
 * Tender price schedules. A schedule is a priced submission; it never moves stock or counts
 * as a sale, and "awarded" is set by hand only once the award has actually been received.
 * Drafts can be edited; once submitted the prices are fixed.
 */
export const tendersRouter = Router();

const include = {
  items: { orderBy: { position: 'asc' as const } },
  createdBy: { select: { fullName: true } },
  branch: { select: { id: true, code: true, name: true } },
} satisfies Prisma.TenderInclude;

type TenderRow = Prisma.TenderGetPayload<{ include: typeof include }>;

function toDto(t: TenderRow): TenderDto {
  return {
    id: t.id,
    branch: t.branch,
    number: t.number,
    scheduleDate: isoDateOnly(t.scheduleDate),
    tenderReference: t.tenderReference,
    submissionDeadline: optionalIsoDateOnly(t.submissionDeadline),
    clientId: t.clientId,
    customerName: t.customerName,
    customerAddress: t.customerAddress,
    lot: t.lot,
    currency: t.currency as TenderDto['currency'],
    taxLabel: t.taxLabel,
    taxRate: decimalString(t.taxRate),
    subtotal: decimalString(t.subtotal),
    taxAmount: decimalString(t.taxAmount),
    total: decimalString(t.total),
    totalInWords: amountInWords(decimalString(t.total), t.currency),
    notes: t.notes,
    status: t.status,
    itemCount: t.items.length,
    items: t.items.map((i) => ({
      id: i.id,
      stockItemId: i.stockItemId,
      description: i.description,
      quantity: decimalString(i.quantity, 3),
      unit: i.unit,
      unitPrice: decimalString(i.unitPrice),
      amount: decimalString(i.amount),
      amountWithTax: decimalString(i.amountWithTax),
      countryOfOrigin: i.countryOfOrigin,
      manufacturer: i.manufacturer,
      brand: i.brand,
      expiryDate: i.expiryDate,
    })),
    preparedBy: t.createdBy.fullName.trim(),
    createdAt: iso(t.createdAt),
    updatedAt: iso(t.updatedAt),
  };
}

async function loadTender(db: Db, id: string): Promise<TenderRow> {
  const row = await db.tender.findUnique({ where: { id }, include });
  if (!row) throw notFound('The price schedule');
  return row;
}

/** Columns shared by create and update, with totals computed on the server. */
function fields(input: z.output<typeof tenderInputSchema>) {
  const totals = calculateTenderTotals(input.items, input.taxRate);
  return {
    data: {
      scheduleDate: dateFromIso(input.scheduleDate),
      tenderReference: input.tenderReference ?? null,
      submissionDeadline: input.submissionDeadline ? dateFromIso(input.submissionDeadline) : null,
      customerName: input.customerName,
      customerAddress: input.customerAddress ?? null,
      lot: input.lot ?? null,
      currency: input.currency,
      taxLabel: input.taxLabel,
      taxRate: input.taxRate,
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      total: totals.total,
      notes: input.notes ?? null,
    },
    items: input.items.map((item, position) => ({
      position,
      stockItemId: item.stockItemId ?? null,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      amount: totals.amounts[position]!,
      amountWithTax: totals.amountsWithTax[position]!,
      countryOfOrigin: item.countryOfOrigin ?? null,
      manufacturer: item.manufacturer ?? null,
      brand: item.brand ?? null,
      expiryDate: item.expiryDate ?? null,
    })),
    totals,
  };
}

tendersRouter.use(requirePermission('tenders.read'));
tendersRouter.param(
  'id',
  branchGuard('The price schedule', (id) => prisma.tender.findUnique({ where: { id }, select: { branchId: true } })),
);

tendersRouter.get('/next-number', requirePermission('tenders.manage'), async (_req, res) => {
  ok(res, { number: await peekDocumentNumber(prisma, 'tender') });
});

tendersRouter.get('/customers', requirePermission('tenders.manage'), async (req, res) => {
  ok(res, await customerOptions(req));
});

tendersRouter.get('/items', requirePermission('tenders.manage'), async (req, res) => {
  ok(res, await stockItemOptions(req));
});

tendersRouter.get('/', async (req, res) => {
  const ctx = getAuth(req);
  const query = parse(tenderListQuerySchema, req.query);
  if (query.branchId) assertBranchAccess(ctx, query.branchId);
  const and: Prisma.TenderWhereInput[] = [optionalBranchWhere(ctx)];
  if (query.branchId) and.push({ branchId: query.branchId });
  if (query.status) and.push({ status: query.status });
  if (query.dateFrom) and.push({ scheduleDate: { gte: dateFromIso(query.dateFrom) } });
  if (query.dateTo) and.push({ scheduleDate: { lte: dateFromIso(query.dateTo) } });
  if (query.q) {
    and.push({
      OR: [
        { number: { contains: query.q, mode: 'insensitive' } },
        { customerName: { contains: query.q, mode: 'insensitive' } },
        { tenderReference: { contains: query.q, mode: 'insensitive' } },
        { lot: { contains: query.q, mode: 'insensitive' } },
      ],
    });
  }
  const where: Prisma.TenderWhereInput = { AND: and };
  const sort = orderBy<Prisma.TenderOrderByWithRelationInput[]>(
    query.sort,
    {
      number: (dir) => [{ number: dir }],
      scheduleDate: (dir) => [{ scheduleDate: dir }, { number: dir }],
      customerName: (dir) => [{ customerName: dir }],
      total: (dir) => [{ total: dir }],
      status: (dir) => [{ status: dir }],
    },
    [{ scheduleDate: 'desc' }, { number: 'desc' }],
  );
  const [rows, total] = await Promise.all([
    prisma.tender.findMany({ where, orderBy: sort, include, ...pageWindow(query) }),
    prisma.tender.count({ where }),
  ]);
  ok(res, rows.map(toDto), pageMeta(query, total));
});

tendersRouter.get('/:id', async (req, res) => {
  ok(res, toDto(await loadTender(prisma, parse(uuid, req.params.id))));
});

tendersRouter.get('/:id/pdf', async (req, res) => {
  const tender = toDto(await loadTender(prisma, parse(uuid, req.params.id)));
  const pdf = await renderTenderPdf(tender, await pdfCompany('Price Schedule'));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${tender.number}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
});

tendersRouter.post('/', requirePermission('tenders.manage'), idempotent, async (req, res) => {
  const ctx = getAuth(req);
  const input = parse(tenderInputSchema, req.body);
  const { data, items, totals } = fields(input);
  const row = await prisma.$transaction(async (tx) => {
    await assertStockItemsExist(tx, input.items.map((i) => i.stockItemId));
    const clientId = await resolveClient(
      tx,
      req,
      ctx,
      { clientId: input.clientId, name: input.customerName, address: input.customerAddress },
      'price schedule',
    );
    const tender = await tx.tender.create({
      data: {
        ...data,
        number: await nextDocumentNumber(tx, 'tender', { date: dateFromIso(input.scheduleDate) }),
        branchId: await resolveDocumentBranch(tx, ctx, input.branchId),
        clientId,
        createdById: ctx.profileId,
        items: { create: items },
      },
      include,
    });
    await recordAudit(tx, actorFrom(req), {
      action: 'tender.created',
      entityType: 'tender',
      entityId: tender.id,
      summary: `Price schedule ${tender.number} created for ${tender.customerName} (${input.currency} ${totals.total})`,
    });
    return tender;
  });
  created(res, toDto(row));
});

tendersRouter.put('/:id', requirePermission('tenders.manage'), async (req, res) => {
  const ctx = getAuth(req);
  const id = parse(uuid, req.params.id);
  const input = parse(tenderInputSchema, req.body);
  const { data, items } = fields(input);
  const row = await prisma.$transaction(async (tx) => {
    const before = await loadTender(tx, id);
    if (before.status !== 'draft') {
      throw invalidState('Only draft price schedules can be edited. Its prices were fixed when it was submitted.');
    }
    await assertStockItemsExist(tx, input.items.map((i) => i.stockItemId));
    const clientId = await resolveClient(
      tx,
      req,
      ctx,
      { clientId: input.clientId, name: input.customerName, address: input.customerAddress },
      'price schedule',
    );
    await tx.tenderItem.deleteMany({ where: { tenderId: id } });
    const updated = await tx.tender.update({
      where: { id },
      data: {
        ...data,
        clientId,
        branchId: input.branchId ? await resolveDocumentBranch(tx, ctx, input.branchId) : before.branchId,
        items: { create: items },
      },
      include,
    });
    await recordAudit(tx, actorFrom(req), {
      action: 'tender.updated',
      entityType: 'tender',
      entityId: id,
      summary: `Price schedule ${before.number} updated`,
    });
    return updated;
  });
  ok(res, toDto(row));
});

tendersRouter.patch('/:id/status', requirePermission('tenders.manage'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  const { status } = parse(tenderStatusSchema, req.body);
  const row = await prisma.$transaction(async (tx) => {
    const before = await loadTender(tx, id);
    if (before.status === status) return before;
    if (status === 'draft' && before.status !== 'draft') {
      throw invalidState('A price schedule that has been submitted cannot go back to draft.');
    }
    const updated = await tx.tender.update({ where: { id }, data: { status }, include });
    await recordAudit(tx, actorFrom(req), {
      action: 'tender.status_changed',
      entityType: 'tender',
      entityId: id,
      summary: `Price schedule ${before.number} changed from ${TENDER_STATUS_LABELS[before.status]} to ${TENDER_STATUS_LABELS[status]}`,
    });
    return updated;
  });
  ok(res, toDto(row));
});

