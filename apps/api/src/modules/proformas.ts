import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import type { Prisma } from '@prisma/client';
import {
  calculateProformaTotals,
  proformaEmailSchema,
  proformaInputSchema,
  proformaListQuerySchema,
  proformaStatusSchema,
  PROFORMA_EMAIL_MAX_FILES,
  PROFORMA_EMAIL_MAX_FILE_BYTES,
  uuid,
  type ProformaDto,
} from '@tsm/shared';
import { getAuth, requirePermission } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { AppError, notFound } from '../lib/errors';
import { orderBy, pageMeta, pageWindow } from '../lib/pagination';
import { prisma } from '../lib/prisma';
import { created, ok } from '../lib/respond';
import { dateFromIso, decimalString, isoDateOnly, iso } from '../lib/serialize';
import { parse } from '../lib/validate';
import { actorFrom, recordAudit } from '../services/audit';
import { assertBranchAccess, branchGuard, optionalBranchWhere, resolveDocumentBranch } from '../services/branch-scope';
import { nextDocumentNumber, peekDocumentNumber } from '../services/document-numbers';
import { EMAIL_NOT_CONFIGURED, emailConfigured, sendEmail } from '../services/email';
import { pdfCompany } from '../services/pdf-company';
import { renderProformaPdf } from '../services/proforma-pdf';
import { assertStockItemsExist, customerOptions, lastPrices, resolveClient, stockItemOptions } from '../services/pickers';
import { deleteRecord, onlyWhen } from '../services/delete-record';

/**
 * Proforma invoices. A proforma is a quotation: it never moves stock or counts as
 * revenue. Customer details are copied onto the document so it stays as issued.
 */
export const proformasRouter = Router();

const include = {
  items: { orderBy: { position: 'asc' as const } },
  createdBy: { select: { fullName: true } },
  branch: { select: { id: true, code: true, name: true } },
} satisfies Prisma.ProformaInclude;

type ProformaRow = Prisma.ProformaGetPayload<{ include: typeof include }>;

function toDto(p: ProformaRow): ProformaDto {
  return {
    id: p.id,
    branch: p.branch,
    number: p.number,
    issueDate: isoDateOnly(p.issueDate),
    currency: p.currency as ProformaDto['currency'],
    clientId: p.clientId,
    customerName: p.customerName,
    customerAddress: p.customerAddress,
    customerEmail: p.customerEmail,
    customerPhone: p.customerPhone,
    vatRate: decimalString(p.vatRate),
    taxRate: decimalString(p.taxRate),
    subtotal: decimalString(p.subtotal),
    vatAmount: decimalString(p.vatAmount),
    taxAmount: decimalString(p.taxAmount),
    total: decimalString(p.total),
    notes: p.notes,
    status: p.status,
    emailedAt: p.emailedAt ? iso(p.emailedAt) : null,
    itemCount: p.items.length,
    items: p.items.map((i) => ({
      id: i.id,
      stockItemId: i.stockItemId,
      name: i.name,
      quantity: decimalString(i.quantity, 3),
      unit: i.unit,
      unitPrice: decimalString(i.unitPrice),
      amount: decimalString(i.amount),
    })),
    preparedBy: p.createdBy.fullName.trim().split(/\s+/)[0] ?? '',
    preparedByName: p.createdBy.fullName.trim(),
    createdAt: iso(p.createdAt),
    updatedAt: iso(p.updatedAt),
  };
}

async function loadProforma(id: string): Promise<ProformaRow> {
  const row = await prisma.proforma.findUnique({ where: { id }, include });
  if (!row) throw notFound('The proforma');
  return row;
}

proformasRouter.use(requirePermission('proformas.read'));
proformasRouter.param(
  'id',
  branchGuard('The proforma', (id) => prisma.proforma.findUnique({ where: { id }, select: { branchId: true } })),
);

/** Number the next proforma will get, for the New Proforma form. */
proformasRouter.get('/next-number', requirePermission('proformas.manage'), async (_req, res) => {
  ok(res, { number: await peekDocumentNumber(prisma, 'proforma') });
});

/** Existing clients to pick from, with the details that fill the customer section. */
proformasRouter.get('/customers', requirePermission('proformas.manage'), async (req, res) => {
  ok(res, await customerOptions(req));
});

/** Stock items to pick from; selecting one fills the unit and unit price. */
proformasRouter.get('/items', requirePermission('proformas.manage'), async (req, res) => {
  ok(res, await stockItemOptions(req));
});

/** What each stock item was last sold for to this client, for the price hint. */
proformasRouter.get('/last-prices', requirePermission('proformas.manage'), async (req, res) => {
  const ctx = getAuth(req);
  const { clientId } = parse(z.object({ clientId: uuid }), req.query);
  ok(res, await lastPrices(ctx, clientId));
});

proformasRouter.get('/', async (req, res) => {
  const ctx = getAuth(req);
  const query = parse(proformaListQuerySchema, req.query);
  if (query.branchId) assertBranchAccess(ctx, query.branchId);
  const and: Prisma.ProformaWhereInput[] = [optionalBranchWhere(ctx)];
  if (query.branchId) and.push({ branchId: query.branchId });
  if (query.status) and.push({ status: query.status });
  if (query.dateFrom) and.push({ issueDate: { gte: dateFromIso(query.dateFrom) } });
  if (query.dateTo) and.push({ issueDate: { lte: dateFromIso(query.dateTo) } });
  if (query.q) {
    and.push({
      OR: [
        { number: { contains: query.q, mode: 'insensitive' } },
        { customerName: { contains: query.q, mode: 'insensitive' } },
      ],
    });
  }
  const where: Prisma.ProformaWhereInput = { AND: and };
  const sort = orderBy<Prisma.ProformaOrderByWithRelationInput[]>(
    query.sort,
    {
      number: (dir) => [{ number: dir }],
      issueDate: (dir) => [{ issueDate: dir }, { number: dir }],
      customerName: (dir) => [{ customerName: dir }],
      total: (dir) => [{ total: dir }],
      status: (dir) => [{ status: dir }],
    },
    [{ issueDate: 'desc' }, { number: 'desc' }],
  );
  const [rows, total] = await Promise.all([
    prisma.proforma.findMany({ where, orderBy: sort, include, ...pageWindow(query) }),
    prisma.proforma.count({ where }),
  ]);
  ok(res, rows.map(toDto), pageMeta(query, total));
});

proformasRouter.get('/:id', async (req, res) => {
  ok(res, toDto(await loadProforma(parse(uuid, req.params.id))));
});

async function pdfFor(proforma: ProformaDto) {
  return renderProformaPdf(proforma, await pdfCompany('Proforma'));
}

proformasRouter.get('/:id/pdf', async (req, res) => {
  const proforma = toDto(await loadProforma(parse(uuid, req.params.id)));
  const pdf = await pdfFor(proforma);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${proforma.number}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
});

proformasRouter.post('/', requirePermission('proformas.manage'), idempotent, async (req, res) => {
  const ctx = getAuth(req);
  const input = parse(proformaInputSchema, req.body);
  const totals = calculateProformaTotals(input.items, 0, input.taxRate);

  const row = await prisma.$transaction(async (tx) => {
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
      'proforma',
    );

    const branchId = await resolveDocumentBranch(tx, ctx, input.branchId);
    const number = await nextDocumentNumber(tx, 'proforma', { date: dateFromIso(input.issueDate) });
    const proforma = await tx.proforma.create({
      data: {
        number,
        branchId,
        issueDate: dateFromIso(input.issueDate),
        currency: input.currency,
        clientId,
        customerName: input.customerName,
        customerAddress: input.customerAddress ?? null,
        customerEmail: input.customerEmail ?? null,
        customerPhone: input.customerPhone ?? null,
        vatRate: 0,
        taxRate: input.taxRate,
        subtotal: totals.subtotal,
        vatAmount: totals.vatAmount,
        taxAmount: totals.taxAmount,
        total: totals.total,
        notes: input.notes ?? null,
        createdById: ctx.profileId,
        items: {
          create: input.items.map((item, position) => ({
            position,
            stockItemId: item.stockItemId ?? null,
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            amount: totals.amounts[position]!,
          })),
        },
      },
      include,
    });
    await recordAudit(tx, actorFrom(req), {
      action: 'proforma.created',
      entityType: 'proforma',
      entityId: proforma.id,
      summary: `Proforma ${proforma.number} created for ${proforma.customerName} (${input.currency} ${totals.total})`,
    });
    return proforma;
  });
  created(res, toDto(row));
});

/** Copies a proforma into a new draft, for a similar quotation. */
proformasRouter.post('/:id/duplicate', requirePermission('proformas.manage'), async (req, res) => {
  const ctx = getAuth(req);
  const id = parse(uuid, req.params.id);
  const row = await prisma.$transaction(async (tx) => {
    const source = await loadProforma(id);
    const copy = await tx.proforma.create({
      data: {
        number: await nextDocumentNumber(tx, 'proforma'),
        issueDate: new Date(new Date().toISOString().slice(0, 10)),
        currency: source.currency,
        branchId: source.branchId,
        clientId: source.clientId,
        customerName: source.customerName,
        customerAddress: source.customerAddress,
        customerEmail: source.customerEmail,
        customerPhone: source.customerPhone,
        vatRate: source.vatRate,
        taxRate: source.taxRate,
        subtotal: source.subtotal,
        vatAmount: source.vatAmount,
        taxAmount: source.taxAmount,
        total: source.total,
        notes: source.notes,
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
      include,
    });
    await recordAudit(tx, actorFrom(req), {
      action: 'proforma.created',
      entityType: 'proforma',
      entityId: copy.id,
      summary: `Proforma ${copy.number} copied from ${source.number}`,
    });
    return copy;
  });
  created(res, toDto(row));
});


/** A proforma can be corrected until the customer has answered it. */
const EDITABLE_STATUSES = ['draft', 'issued'] as const;

proformasRouter.put('/:id', requirePermission('proformas.manage'), async (req, res) => {
  const ctx = getAuth(req);
  const id = parse(uuid, req.params.id);
  const input = parse(proformaInputSchema, req.body);
  const totals = calculateProformaTotals(input.items, 0, input.taxRate);

  const row = await prisma.$transaction(async (tx) => {
    const before = await tx.proforma.findUnique({ where: { id } });
    if (!before) throw notFound('The proforma');
    if (!(EDITABLE_STATUSES as readonly string[]).includes(before.status)) {
      throw new AppError('CONFLICT', `Proforma ${before.number} is ${before.status} and can no longer be edited.`);
    }
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
      'proforma',
    );
    const branchId = input.branchId ? await resolveDocumentBranch(tx, ctx, input.branchId) : before.branchId;
    // Guard against a concurrent status change between the read above and this write.
    const claimed = await tx.proforma.updateMany({
      where: { id, status: before.status },
      data: {
        branchId,
        issueDate: dateFromIso(input.issueDate),
        currency: input.currency,
        clientId,
        customerName: input.customerName,
        customerAddress: input.customerAddress ?? null,
        customerEmail: input.customerEmail ?? null,
        customerPhone: input.customerPhone ?? null,
        taxRate: input.taxRate,
        subtotal: totals.subtotal,
        vatAmount: totals.vatAmount,
        taxAmount: totals.taxAmount,
        total: totals.total,
        notes: input.notes ?? null,
      },
    });
    if (claimed.count === 0) {
      throw new AppError('CONFLICT', 'This proforma was changed by someone else. Reopen it and try again.');
    }
    await tx.proformaItem.deleteMany({ where: { proformaId: id } });
    await tx.proformaItem.createMany({
      data: input.items.map((item, position) => ({
        proformaId: id,
        position,
        stockItemId: item.stockItemId ?? null,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        amount: totals.amounts[position]!,
      })),
    });
    await recordAudit(tx, actorFrom(req), {
      action: 'proforma.updated',
      entityType: 'proforma',
      entityId: id,
      summary: `Proforma ${before.number} edited (${input.currency} ${totals.total})`,
    });
    return loadProforma(id);
  });
  ok(res, toDto(row));
});

proformasRouter.patch('/:id/status', requirePermission('proformas.manage'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  const { status } = parse(proformaStatusSchema, req.body);
  const row = await prisma.$transaction(async (tx) => {
    const before = await tx.proforma.findUnique({ where: { id } });
    if (!before) throw notFound('The proforma');
    if (before.status === status) return loadProforma(id);
    const updated = await tx.proforma.update({ where: { id }, data: { status }, include });
    await recordAudit(tx, actorFrom(req), {
      action: 'proforma.status_changed',
      entityType: 'proforma',
      entityId: id,
      summary: `Proforma ${before.number} changed from ${before.status} to ${status}`,
    });
    return updated;
  });
  ok(res, toDto(row));
});

/* ---------- Email ---------- */

const BLOCKED_EXTENSIONS = /\.(exe|bat|cmd|com|scr|msi|js|jse|vbs|ps1|jar|dll|sh)$/i;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PROFORMA_EMAIL_MAX_FILE_BYTES, files: PROFORMA_EMAIL_MAX_FILES },
});

function acceptFiles(req: Request, res: Response, next: NextFunction) {
  upload.array('files', PROFORMA_EMAIL_MAX_FILES)(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const limit = Math.round(PROFORMA_EMAIL_MAX_FILE_BYTES / 1024 / 1024);
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `Each attachment must be ${limit} MB or smaller.`
          : `Attach up to ${PROFORMA_EMAIL_MAX_FILES} files.`;
      return next(new AppError('VALIDATION_FAILED', message, { files: message }));
    }
    next(err);
  });
}

const emailLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) =>
    next(new AppError('RATE_LIMITED', 'Too many emails have been sent from here in the last hour. Wait a while and try again.')),
});

proformasRouter.post('/:id/email', requirePermission('proformas.manage'), emailLimiter, acceptFiles, async (req, res) => {
  const id = parse(uuid, req.params.id);
  const input = parse(proformaEmailSchema, req.body);
  if (!emailConfigured()) throw new AppError('SERVICE_UNAVAILABLE', EMAIL_NOT_CONFIGURED);

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const blocked = files.find((f) => BLOCKED_EXTENSIONS.test(f.originalname));
  if (blocked) {
    const message = `"${blocked.originalname}" can't be attached because executable and script files are not allowed.`;
    throw new AppError('VALIDATION_FAILED', message, { files: message });
  }

  const proforma = toDto(await loadProforma(id));
  const attachments = files.map((f) => ({ filename: f.originalname, content: f.buffer, contentType: f.mimetype }));
  if (input.attachInvoice) {
    attachments.unshift({
      filename: `${proforma.number}.pdf`,
      content: await pdfFor(proforma),
      contentType: 'application/pdf',
    });
  }

  await sendEmail({ to: input.to, toName: proforma.customerName, subject: input.subject, text: input.body, attachments });

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.proforma.update({
      where: { id },
      data: { emailedAt: new Date(), ...(proforma.status === 'draft' ? { status: 'issued' as const } : {}) },
      include,
    });
    await recordAudit(tx, actorFrom(req), {
      action: 'proforma.emailed',
      entityType: 'proforma',
      entityId: id,
      summary: `Proforma ${proforma.number} emailed to ${input.to} with ${attachments.length} attachment(s)`,
    });
    return updated;
  });
  ok(res, toDto(row));
});

/** Deletes a record nothing depends on; anything already in use is cancelled or archived instead. */
proformasRouter.delete('/:id', requirePermission('proformas.manage'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  await deleteRecord(req, 'proforma', id, 'proforma', async (tx) => {
    const row = await tx.proforma.findUnique({ where: { id } });
    if (!row) throw notFound('The proforma');
    onlyWhen(row.status, ['draft'], `Proforma ${row.number} has been issued and can't be deleted. Mark it rejected or expired instead.`);
    await tx.proforma.delete({ where: { id } });
    return `Draft proforma ${row.number} deleted`;
  });
  res.status(204).end();
});
