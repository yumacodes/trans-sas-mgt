import type { NextFunction, Request, Response } from 'express';
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
  type ProformaCustomerOptionDto,
  type ProformaDto,
  type ProformaItemOptionDto,
} from '@tsm/shared';
import { z } from 'zod';
import { can, getAuth, requirePermission } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { AppError, invalidState, notFound } from '../lib/errors';
import { orderBy, pageMeta, pageWindow } from '../lib/pagination';
import { prisma } from '../lib/prisma';
import { created, ok } from '../lib/respond';
import { dateFromIso, decimalString, isoDateOnly, iso } from '../lib/serialize';
import { parse } from '../lib/validate';
import { actorFrom, recordAudit } from '../services/audit';
import { optionalBranchWhere } from '../services/branch-scope';
import { nextDocumentNumber, peekDocumentNumber } from '../services/document-numbers';
import { EMAIL_NOT_CONFIGURED, emailConfigured, sendEmail } from '../services/email';
import { renderProformaPdf } from '../services/proforma-pdf';
import { findAccessibleClient } from './clients';

/**
 * Proforma invoices. A proforma is a quotation: it never moves stock or counts as
 * revenue. Customer details are copied onto the document so it stays as issued.
 */
export const proformasRouter = Router();

const include = {
  items: { orderBy: { position: 'asc' as const } },
  createdBy: { select: { fullName: true } },
} satisfies Prisma.ProformaInclude;

type ProformaRow = Prisma.ProformaGetPayload<{ include: typeof include }>;

function toDto(p: ProformaRow): ProformaDto {
  return {
    id: p.id,
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

/** Number the next proforma will get, for the New Proforma form. */
proformasRouter.get('/next-number', requirePermission('proformas.manage'), async (_req, res) => {
  ok(res, { number: await peekDocumentNumber(prisma, 'proforma') });
});

/** Existing clients to pick from, with the details that fill the customer section. */
proformasRouter.get('/customers', requirePermission('proformas.manage'), async (req, res) => {
  const ctx = getAuth(req);
  const { q } = parse(z.object({ q: z.string().trim().max(100).optional() }), req.query);
  const rows = await prisma.client.findMany({
    where: {
      status: 'active',
      ...optionalBranchWhere(ctx),
      ...(q
        ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }] }
        : {}),
    },
    select: { id: true, code: true, name: true, billingAddress: true, email: true, phone: true },
    orderBy: { name: 'asc' },
    take: 20,
  });
  ok<ProformaCustomerOptionDto[]>(
    res,
    rows.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      address: c.billingAddress,
      email: c.email,
      phone: c.phone,
    })),
  );
});

/** Stock items to pick from; selecting one fills the unit and unit price. */
proformasRouter.get('/items', requirePermission('proformas.manage'), async (req, res) => {
  const { q } = parse(z.object({ q: z.string().trim().max(100).optional() }), req.query);
  const rows = await prisma.stockItem.findMany({
    where: {
      isActive: true,
      ...(q
        ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }] }
        : {}),
    },
    select: { id: true, sku: true, name: true, unit: true, sellingPrice: true },
    orderBy: { name: 'asc' },
    take: 20,
  });
  ok<ProformaItemOptionDto[]>(
    res,
    rows.map((i) => ({ ...i, sellingPrice: decimalString(i.sellingPrice) })),
  );
});

proformasRouter.get('/', async (req, res) => {
  const query = parse(proformaListQuerySchema, req.query);
  const and: Prisma.ProformaWhereInput[] = [];
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
  const company = await prisma.companyProfile.findFirst();
  const address = [company?.addressLine1, company?.addressLine2, [company?.city, company?.region].filter(Boolean).join(', '), company?.country]
    .filter((l): l is string => Boolean(l));
  const phones = (company?.phone ?? '')
    .split(/[,;\n]+/)
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n, i) => `${i === 0 ? 'Tel:' : '        '} ${n}`);
  const contact = [...phones, company?.email && `Email: ${company.email}`, company?.website]
    .filter((l): l is string => Boolean(l));
  const name = company?.legalName || company?.name || 'Proforma';
  return renderProformaPdf(proforma, {
    name,
    lines: [...address, ...contact, company?.taxId ? `Tax ID: ${company.taxId}` : ''].filter(Boolean),
    footer: [name, ...address.slice(0, 2)].join('  |  '),
  });
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
    const stockIds = [...new Set(input.items.map((i) => i.stockItemId).filter((v): v is string => Boolean(v)))];
    if (stockIds.length) {
      const found = await tx.stockItem.count({ where: { id: { in: stockIds } } });
      if (found !== stockIds.length) {
        throw new AppError('VALIDATION_FAILED', 'One of the selected items no longer exists. Pick it again.', {
          items: 'One of the selected items no longer exists. Pick it again.',
        });
      }
    }

    // Link to the client directory: the chosen client, an existing one with the same
    // name, or (when allowed) a new client created from the details typed in.
    let clientId: string | null = null;
    if (input.clientId) {
      const client = await findAccessibleClient(tx, ctx, input.clientId);
      if (client.status !== 'active') throw invalidState('This client is archived. Restore it before raising a proforma.');
      clientId = client.id;
    } else {
      const existing = await tx.client.findFirst({
        where: { name: { equals: input.customerName, mode: 'insensitive' }, status: 'active', ...optionalBranchWhere(ctx) },
        select: { id: true },
      });
      if (existing) {
        clientId = existing.id;
      } else if (can(ctx, 'clients.create')) {
        const client = await tx.client.create({
          data: {
            code: await nextDocumentNumber(tx, 'client'),
            name: input.customerName,
            organizationType: 'other',
            email: input.customerEmail ?? null,
            phone: input.customerPhone ?? null,
            billingAddress: input.customerAddress ?? null,
            createdById: ctx.profileId,
          },
        });
        await recordAudit(tx, actorFrom(req), {
          action: 'client.created',
          entityType: 'client',
          entityId: client.id,
          summary: `Client ${client.code} – ${client.name} created from a proforma`,
        });
        clientId = client.id;
      }
    }

    const number = await nextDocumentNumber(tx, 'proforma', { date: dateFromIso(input.issueDate) });
    const proforma = await tx.proforma.create({
      data: {
        number,
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
