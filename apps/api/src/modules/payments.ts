import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  paymentInputSchema,
  paymentListQuerySchema,
  paymentReverseSchema,
  uuid,
  type OpenSaleOptionDto,
  type PaymentDto,
} from '@tsm/shared';
import { getAuth, requirePermission } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { AppError, invalidState, notFound } from '../lib/errors';
import { orderBy, pageMeta, pageWindow } from '../lib/pagination';
import { prisma, type Db } from '../lib/prisma';
import { created, ok } from '../lib/respond';
import { dateFromIso, decimalString, iso, isoDateOnly, optionalIso } from '../lib/serialize';
import { parse } from '../lib/validate';
import { actorFrom, recordAudit } from '../services/audit';
import { assertBranchAccess, branchGuard, branchWhere, canAccessBranch } from '../services/branch-scope';
import { nextDocumentNumber } from '../services/document-numbers';
import { notify } from '../services/notifications';
import { pdfCompany } from '../services/pdf-company';
import { renderReceiptPdf } from '../services/receipt-pdf';
import { saleBalance } from './sales';

/**
 * Customer receipts against confirmed sales. A sale's balance is its total less its posted
 * payments. Recording a payment locks the sale row, so two people can't overpay it together.
 * A payment is never edited or deleted: a mistake is reversed, which keeps the history.
 */
export const paymentsRouter = Router();

const include = {
  sale: {
    select: {
      id: true,
      number: true,
      total: true,
      customerName: true,
      payments: { where: { status: 'posted' as const }, select: { amount: true } },
    },
  },
  branch: { select: { id: true, code: true, name: true } },
  createdBy: { select: { fullName: true } },
} satisfies Prisma.PaymentInclude;

type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof include }>;

function toDto(p: PaymentRow): PaymentDto {
  const { balance } = saleBalance(p.sale.total, p.sale.payments);
  return {
    id: p.id,
    number: p.number,
    sale: {
      id: p.sale.id,
      number: p.sale.number,
      total: decimalString(p.sale.total),
      balance: decimalString(balance),
    },
    branch: p.branch,
    customerName: p.sale.customerName,
    paymentDate: isoDateOnly(p.paymentDate),
    amount: decimalString(p.amount),
    currency: p.currency as PaymentDto['currency'],
    method: p.method,
    externalReference: p.externalReference,
    notes: p.notes,
    status: p.status,
    reverseReason: p.reverseReason,
    reversedAt: optionalIso(p.reversedAt),
    recordedBy: p.createdBy.fullName.trim(),
    createdAt: iso(p.createdAt),
  };
}

async function loadPayment(db: Db, id: string): Promise<PaymentRow> {
  const row = await db.payment.findUnique({ where: { id }, include });
  if (!row) throw notFound('The payment');
  return row;
}

paymentsRouter.use(requirePermission('payments.read'));
paymentsRouter.param(
  'id',
  branchGuard('The payment', (id) => prisma.payment.findUnique({ where: { id }, select: { branchId: true } })),
);

/** Confirmed sales that still have money owing. */
paymentsRouter.get('/open-sales', requirePermission('payments.record'), async (req, res) => {
  const ctx = getAuth(req);
  const { q } = parse(z.object({ q: z.string().trim().max(100).optional() }), req.query);
  const rows = await prisma.sale.findMany({
    where: {
      status: 'confirmed',
      ...branchWhere(ctx),
      ...(q
        ? {
            OR: [
              { number: { contains: q, mode: 'insensitive' } },
              { customerName: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: { payments: { where: { status: 'posted' }, select: { amount: true } } },
    orderBy: { saleDate: 'desc' },
    take: 100,
  });
  const open: OpenSaleOptionDto[] = rows
    .map((s) => ({ sale: s, balance: saleBalance(s.total, s.payments).balance }))
    .filter((r) => r.balance.gt(0))
    .slice(0, 20)
    .map(({ sale, balance }) => ({
      id: sale.id,
      number: sale.number,
      customerName: sale.customerName,
      currency: sale.currency as OpenSaleOptionDto['currency'],
      total: decimalString(sale.total),
      balance: decimalString(balance),
    }));
  ok(res, open);
});

paymentsRouter.get('/', async (req, res) => {
  const ctx = getAuth(req);
  const query = parse(paymentListQuerySchema, req.query);
  if (query.branchId) assertBranchAccess(ctx, query.branchId);
  const and: Prisma.PaymentWhereInput[] = [branchWhere(ctx)];
  if (query.branchId) and.push({ branchId: query.branchId });
  if (query.status) and.push({ status: query.status });
  if (query.saleId) and.push({ saleId: query.saleId });
  if (query.dateFrom) and.push({ paymentDate: { gte: dateFromIso(query.dateFrom) } });
  if (query.dateTo) and.push({ paymentDate: { lte: dateFromIso(query.dateTo) } });
  if (query.q) {
    and.push({
      OR: [
        { number: { contains: query.q, mode: 'insensitive' } },
        { externalReference: { contains: query.q, mode: 'insensitive' } },
        { sale: { number: { contains: query.q, mode: 'insensitive' } } },
        { sale: { customerName: { contains: query.q, mode: 'insensitive' } } },
      ],
    });
  }
  const where: Prisma.PaymentWhereInput = { AND: and };
  const sort = orderBy<Prisma.PaymentOrderByWithRelationInput[]>(
    query.sort,
    {
      number: (dir) => [{ number: dir }],
      paymentDate: (dir) => [{ paymentDate: dir }, { number: dir }],
      amount: (dir) => [{ amount: dir }],
      status: (dir) => [{ status: dir }],
    },
    [{ paymentDate: 'desc' }, { number: 'desc' }],
  );
  const [rows, total] = await Promise.all([
    prisma.payment.findMany({ where, orderBy: sort, include, ...pageWindow(query) }),
    prisma.payment.count({ where }),
  ]);
  ok(res, rows.map(toDto), pageMeta(query, total));
});

paymentsRouter.get('/:id', async (req, res) => {
  ok(res, toDto(await loadPayment(prisma, parse(uuid, req.params.id))));
});

paymentsRouter.get('/:id/pdf', async (req, res) => {
  const payment = toDto(await loadPayment(prisma, parse(uuid, req.params.id)));
  const pdf = await renderReceiptPdf(payment, await pdfCompany('Receipt'));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${payment.number}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
});

paymentsRouter.post('/', requirePermission('payments.record'), idempotent, async (req, res) => {
  const ctx = getAuth(req);
  const input = parse(paymentInputSchema, req.body);
  const row = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM sales WHERE id = ${input.saleId}::uuid FOR UPDATE`;
    const sale = await tx.sale.findUnique({
      where: { id: input.saleId },
      include: { payments: { where: { status: 'posted' }, select: { amount: true } } },
    });
    if (!sale || !canAccessBranch(ctx, sale.branchId)) throw notFound('The sale');
    if (sale.status !== 'confirmed') throw invalidState('Payments can only be recorded against a confirmed sale.');
    const { balance } = saleBalance(sale.total, sale.payments);
    if (new Prisma.Decimal(input.amount).gt(balance)) {
      const message = `This is more than the outstanding balance of ${sale.currency} ${balance.toFixed(2)}.`;
      throw new AppError('VALIDATION_FAILED', message, { amount: message });
    }
    if (input.externalReference) {
      const duplicate = await tx.payment.count({
        where: { method: input.method, externalReference: input.externalReference, status: 'posted' },
      });
      if (duplicate > 0) {
        const message = 'A payment with this reference is already recorded. Check it is not a duplicate.';
        throw new AppError('VALIDATION_FAILED', message, { externalReference: message });
      }
    }
    const payment = await tx.payment.create({
      data: {
        number: await nextDocumentNumber(tx, 'payment', { date: dateFromIso(input.paymentDate) }),
        saleId: sale.id,
        branchId: sale.branchId,
        paymentDate: dateFromIso(input.paymentDate),
        amount: input.amount,
        currency: sale.currency,
        method: input.method,
        externalReference: input.externalReference ?? null,
        notes: input.notes ?? null,
        createdById: ctx.profileId,
      },
      include,
    });
    await recordAudit(tx, actorFrom(req), {
      action: 'payment.recorded',
      entityType: 'payment',
      entityId: payment.id,
      summary: `Payment ${payment.number} of ${sale.currency} ${input.amount} recorded against sale ${sale.number}`,
    });
    await notify(tx, sale.createdById === ctx.profileId ? [] : [sale.createdById], {
      type: 'payment',
      title: `Payment received on sale ${sale.number}`,
      body: `${sale.currency} ${input.amount} from ${sale.customerName}`,
      link: `/sales?open=${sale.id}`,
      dedupeKey: `payment:${payment.id}`,
    });
    return payment;
  });
  created(res, toDto(row));
});

paymentsRouter.post('/:id/reverse', requirePermission('payments.reverse'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  const { reason } = parse(paymentReverseSchema, req.body);
  const row = await prisma.$transaction(async (tx) => {
    const before = await loadPayment(tx, id);
    if (before.status === 'reversed') return before;
    const claimed = await tx.payment.updateMany({
      where: { id, status: 'posted' },
      data: { status: 'reversed', reverseReason: reason, reversedAt: new Date() },
    });
    if (claimed.count === 0) return loadPayment(tx, id);
    await recordAudit(tx, actorFrom(req), {
      action: 'payment.reversed',
      entityType: 'payment',
      entityId: id,
      summary: `Payment ${before.number} reversed: ${reason}`,
    });
    return loadPayment(tx, id);
  });
  ok(res, toDto(row));
});
