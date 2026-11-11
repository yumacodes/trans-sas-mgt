import { Router, type Request } from 'express';
import type { Prisma } from '@prisma/client';
import {
  acceptanceBody,
  acceptanceSubject,
  ACCEPTANCE_STATUS_LABELS,
  acceptanceInputSchema,
  acceptanceListQuerySchema,
  acceptanceStatusSchema,
  uuid,
  type AcceptanceDefaultsDto,
  type AcceptanceDto,
} from '@tsm/shared';
import type { z } from 'zod';
import { getAuth, requirePermission, type AuthContext } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { AppError, invalidState, notFound } from '../lib/errors';
import { orderBy, pageMeta, pageWindow } from '../lib/pagination';
import { prisma, type Db, type Tx } from '../lib/prisma';
import { created, ok } from '../lib/respond';
import { dateFromIso, iso, isoDateOnly, optionalIsoDateOnly } from '../lib/serialize';
import { parse } from '../lib/validate';
import { renderAcceptancePdf } from '../services/acceptance-pdf';
import { actorFrom, recordAudit } from '../services/audit';
import { assertBranchAccess, branchGuard, canAccessBranch, optionalBranchWhere, resolveDocumentBranch } from '../services/branch-scope';
import { nextDocumentNumber, peekDocumentNumber } from '../services/document-numbers';
import { pdfCompany } from '../services/pdf-company';
import { documentEmailRoute } from '../services/document-email';
import { customerOptions, resolveClient } from '../services/pickers';

/**
 * Acceptance letters for contract awards. A draft can be edited; "issued" records that the
 * letter has gone to the client. Letters are cancelled rather than deleted.
 */
export const acceptanceLettersRouter = Router();

const include = {
  tender: { select: { id: true, number: true } },
  createdBy: { select: { fullName: true } },
  branch: { select: { id: true, code: true, name: true } },
} satisfies Prisma.AcceptanceLetterInclude;

type LetterRow = Prisma.AcceptanceLetterGetPayload<{ include: typeof include }>;

function toDto(l: LetterRow): AcceptanceDto {
  return {
    id: l.id,
    branch: l.branch,
    number: l.number,
    letterDate: isoDateOnly(l.letterDate),
    yourReference: l.yourReference,
    clientId: l.clientId,
    recipientName: l.recipientName,
    recipientAddress: l.recipientAddress,
    contractNumber: l.contractNumber,
    awardLetterDate: optionalIsoDateOnly(l.awardLetterDate),
    supplyDescription: l.supplyDescription,
    subject: l.subject,
    body: l.body,
    signatoryName: l.signatoryName,
    signatoryTitle: l.signatoryTitle,
    tender: l.tender,
    status: l.status,
    preparedBy: l.createdBy.fullName.trim(),
    createdAt: iso(l.createdAt),
    updatedAt: iso(l.updatedAt),
  };
}

async function loadLetter(db: Db, id: string): Promise<LetterRow> {
  const row = await db.acceptanceLetter.findUnique({ where: { id }, include });
  if (!row) throw notFound('The acceptance letter');
  return row;
}

async function checkTender(tx: Tx, ctx: AuthContext, tenderId: string | null | undefined) {
  if (!tenderId) return;
  const found = await tx.tender.count({ where: { id: tenderId, ...optionalBranchWhere(ctx) } });
  if (!found) {
    const message = 'That price schedule no longer exists. Choose another or leave it empty.';
    throw new AppError('VALIDATION_FAILED', message, { tenderId: message });
  }
}

function fields(input: z.output<typeof acceptanceInputSchema>) {
  return {
    letterDate: dateFromIso(input.letterDate),
    yourReference: input.yourReference ?? null,
    recipientName: input.recipientName,
    recipientAddress: input.recipientAddress ?? null,
    contractNumber: input.contractNumber,
    awardLetterDate: input.awardLetterDate ? dateFromIso(input.awardLetterDate) : null,
    supplyDescription: input.supplyDescription,
    subject: input.subject,
    body: input.body,
    signatoryName: input.signatoryName,
    signatoryTitle: input.signatoryTitle ?? null,
    tenderId: input.tenderId ?? null,
  };
}

acceptanceLettersRouter.use(requirePermission('acceptance.read'));
acceptanceLettersRouter.param(
  'id',
  branchGuard('The acceptance letter', (id) =>
    prisma.acceptanceLetter.findUnique({ where: { id }, select: { branchId: true } }),
  ),
);

acceptanceLettersRouter.get('/next-number', requirePermission('acceptance.manage'), async (_req, res) => {
  ok(res, { number: await peekDocumentNumber(prisma, 'acceptance') });
});

/** The signatory of the most recent letter, so the next one starts with it. */
acceptanceLettersRouter.get('/defaults', requirePermission('acceptance.manage'), async (_req, res) => {
  const last = await prisma.acceptanceLetter.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { signatoryName: true, signatoryTitle: true },
  });
  ok<AcceptanceDefaultsDto>(res, { signatoryName: last?.signatoryName ?? null, signatoryTitle: last?.signatoryTitle ?? null });
});

acceptanceLettersRouter.get('/customers', requirePermission('acceptance.manage'), async (req, res) => {
  ok(res, await customerOptions(req));
});

acceptanceLettersRouter.get('/', async (req, res) => {
  const ctx = getAuth(req);
  const query = parse(acceptanceListQuerySchema, req.query);
  if (query.branchId) assertBranchAccess(ctx, query.branchId);
  const and: Prisma.AcceptanceLetterWhereInput[] = [optionalBranchWhere(ctx)];
  if (query.branchId) and.push({ branchId: query.branchId });
  if (query.status) and.push({ status: query.status });
  if (query.dateFrom) and.push({ letterDate: { gte: dateFromIso(query.dateFrom) } });
  if (query.dateTo) and.push({ letterDate: { lte: dateFromIso(query.dateTo) } });
  if (query.q) {
    and.push({
      OR: [
        { number: { contains: query.q, mode: 'insensitive' } },
        { recipientName: { contains: query.q, mode: 'insensitive' } },
        { contractNumber: { contains: query.q, mode: 'insensitive' } },
        { yourReference: { contains: query.q, mode: 'insensitive' } },
      ],
    });
  }
  const where: Prisma.AcceptanceLetterWhereInput = { AND: and };
  const sort = orderBy<Prisma.AcceptanceLetterOrderByWithRelationInput[]>(
    query.sort,
    {
      number: (dir) => [{ number: dir }],
      letterDate: (dir) => [{ letterDate: dir }, { number: dir }],
      recipientName: (dir) => [{ recipientName: dir }],
      status: (dir) => [{ status: dir }],
    },
    [{ letterDate: 'desc' }, { number: 'desc' }],
  );
  const [rows, total] = await Promise.all([
    prisma.acceptanceLetter.findMany({ where, orderBy: sort, include, ...pageWindow(query) }),
    prisma.acceptanceLetter.count({ where }),
  ]);
  ok(res, rows.map(toDto), pageMeta(query, total));
});

acceptanceLettersRouter.get('/:id', async (req, res) => {
  ok(res, toDto(await loadLetter(prisma, parse(uuid, req.params.id))));
});

acceptanceLettersRouter.get('/:id/pdf', async (req, res) => {
  const letter = toDto(await loadLetter(prisma, parse(uuid, req.params.id)));
  const pdf = await renderAcceptancePdf(letter, await pdfCompany('Acceptance Letter'));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${letter.number}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
});

acceptanceLettersRouter.post(
  '/:id/email',
  ...documentEmailRoute({
    permission: 'acceptance.manage',
    entityType: 'acceptance',
    load: async (id) => {
      const letter = toDto(await loadLetter(prisma, id));
      return {
        number: letter.number,
        recipientName: letter.recipientName,
        pdf: async () => renderAcceptancePdf(letter, await pdfCompany('Acceptance Letter')),
      };
    },
  }),
);

acceptanceLettersRouter.post('/', requirePermission('acceptance.manage'), idempotent, async (req, res) => {
  const ctx = getAuth(req);
  const input = parse(acceptanceInputSchema, req.body);
  const row = await prisma.$transaction(async (tx) => {
    await checkTender(tx, ctx, input.tenderId);
    const clientId = await resolveClient(
      tx,
      req,
      ctx,
      { clientId: input.clientId, name: input.recipientName, address: input.recipientAddress },
      'acceptance letter',
    );
    const letter = await tx.acceptanceLetter.create({
      data: {
        ...fields(input),
        branchId: await resolveDocumentBranch(tx, ctx, input.branchId),
        number: await nextDocumentNumber(tx, 'acceptance', { date: dateFromIso(input.letterDate) }),
        clientId,
        createdById: ctx.profileId,
      },
      include,
    });
    await recordAudit(tx, actorFrom(req), {
      action: 'acceptance.created',
      entityType: 'acceptance',
      entityId: letter.id,
      summary: `Acceptance letter ${letter.number} created for ${letter.recipientName} (contract ${letter.contractNumber})`,
    });
    return letter;
  });
  created(res, toDto(row));
});

acceptanceLettersRouter.put('/:id', requirePermission('acceptance.manage'), async (req, res) => {
  const ctx = getAuth(req);
  const id = parse(uuid, req.params.id);
  const input = parse(acceptanceInputSchema, req.body);
  const row = await prisma.$transaction(async (tx) => {
    const before = await loadLetter(tx, id);
    if (before.status !== 'draft') throw invalidState('Only draft letters can be edited.');
    await checkTender(tx, ctx, input.tenderId);
    const clientId = await resolveClient(
      tx,
      req,
      ctx,
      { clientId: input.clientId, name: input.recipientName, address: input.recipientAddress },
      'acceptance letter',
    );
    const branchId = input.branchId ? await resolveDocumentBranch(tx, ctx, input.branchId) : before.branchId;
    const updated = await tx.acceptanceLetter.update({
      where: { id },
      data: { ...fields(input), clientId, branchId },
      include,
    });
    await recordAudit(tx, actorFrom(req), {
      action: 'acceptance.updated',
      entityType: 'acceptance',
      entityId: id,
      summary: `Acceptance letter ${before.number} updated`,
    });
    return updated;
  });
  ok(res, toDto(row));
});

/** Draft letter accepting an awarded price schedule or a delivered order, filled from it. */
async function draftLetter(
  req: Request,
  source: {
    branchId: string | null;
    clientId: string | null;
    recipientName: string;
    recipientAddress: string | null;
    contractNumber: string;
    tenderId: string | null;
    from: string;
  },
) {
  const ctx = getAuth(req);
  return prisma.$transaction(async (tx) => {
    const last = await tx.acceptanceLetter.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { signatoryName: true, signatoryTitle: true },
    });
    const supplyDescription = 'MEDICAL ITEMS';
    const letter = await tx.acceptanceLetter.create({
      data: {
        number: await nextDocumentNumber(tx, 'acceptance'),
        letterDate: new Date(new Date().toISOString().slice(0, 10)),
        branchId: source.branchId ?? (await resolveDocumentBranch(tx, ctx, null)),
        clientId: source.clientId,
        recipientName: source.recipientName,
        recipientAddress: source.recipientAddress,
        contractNumber: source.contractNumber,
        supplyDescription,
        subject: acceptanceSubject(source.contractNumber),
        body: acceptanceBody({ supplyDescription }),
        signatoryName: last?.signatoryName ?? ctx.fullName ?? '',
        signatoryTitle: last?.signatoryTitle ?? null,
        tenderId: source.tenderId,
        createdById: ctx.profileId,
      },
      include,
    });
    await recordAudit(tx, actorFrom(req), {
      action: 'acceptance.created',
      entityType: 'acceptance',
      entityId: letter.id,
      summary: `Acceptance letter ${letter.number} drafted from ${source.from}`,
    });
    return letter;
  });
}

acceptanceLettersRouter.post('/from-tender/:tenderId', requirePermission('acceptance.manage'), async (req, res) => {
  const ctx = getAuth(req);
  const tender = await prisma.tender.findUnique({ where: { id: parse(uuid, req.params.tenderId) } });
  if (!tender || !canAccessBranch(ctx, tender.branchId)) throw notFound('The price schedule');
  if (tender.status !== 'awarded') throw invalidState('Only an awarded price schedule can have an acceptance letter.');
  const letter = await draftLetter(req, {
    branchId: tender.branchId,
    clientId: tender.clientId,
    recipientName: tender.customerName,
    recipientAddress: tender.customerAddress,
    contractNumber: tender.tenderReference ?? tender.number,
    tenderId: tender.id,
    from: `price schedule ${tender.number}`,
  });
  created(res, toDto(letter));
});

acceptanceLettersRouter.post('/from-waybill/:waybillId', requirePermission('acceptance.manage'), async (req, res) => {
  const ctx = getAuth(req);
  const waybill = await prisma.waybill.findUnique({
    where: { id: parse(uuid, req.params.waybillId) },
    include: { sale: { select: { number: true, tenderId: true } } },
  });
  if (!waybill || !canAccessBranch(ctx, waybill.branchId)) throw notFound('The waybill');
  if (waybill.status !== 'delivered') throw invalidState('Only a delivered waybill can have an acceptance letter.');
  const letter = await draftLetter(req, {
    branchId: waybill.branchId,
    clientId: waybill.clientId,
    recipientName: waybill.recipientName,
    recipientAddress: waybill.deliveryAddress,
    contractNumber: waybill.sale?.number ?? waybill.number,
    tenderId: waybill.sale?.tenderId ?? null,
    from: `waybill ${waybill.number}`,
  });
  created(res, toDto(letter));
});

acceptanceLettersRouter.patch('/:id/status', requirePermission('acceptance.manage'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  const { status } = parse(acceptanceStatusSchema, req.body);
  const row = await prisma.$transaction(async (tx) => {
    const before = await loadLetter(tx, id);
    if (before.status === status) return before;
    if (before.status === 'cancelled') throw invalidState('A cancelled letter cannot be reopened. Create a new one instead.');
    if (status === 'draft') throw invalidState('An issued letter cannot go back to draft.');
    const updated = await tx.acceptanceLetter.update({ where: { id }, data: { status }, include });
    await recordAudit(tx, actorFrom(req), {
      action: 'acceptance.status_changed',
      entityType: 'acceptance',
      entityId: id,
      summary: `Acceptance letter ${before.number} changed from ${ACCEPTANCE_STATUS_LABELS[before.status]} to ${ACCEPTANCE_STATUS_LABELS[status]}`,
    });
    return updated;
  });
  ok(res, toDto(row));
});
