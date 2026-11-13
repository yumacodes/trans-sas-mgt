import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import {
  EXPENSE_KINDS,
  EXPENSE_KIND_LABELS,
  EXPENSE_STATUS_LABELS,
  EXPENSE_TRANSITIONS,
  expenseInputSchema,
  expenseListQuerySchema,
  expenseStatusSchema,
  expenseUpdateSchema,
  uuid,
  type ExpenseDto,
} from '@tsm/shared';
import { z } from 'zod';
import { can, getAuth, requirePermission, type AuthContext } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { AppError, invalidState, notFound } from '../lib/errors';
import { orderBy, pageMeta, pageWindow } from '../lib/pagination';
import { prisma, type Db, type Tx } from '../lib/prisma';
import { created, ok } from '../lib/respond';
import { dateFromIso, decimalString, iso, isoDateOnly } from '../lib/serialize';
import { parse } from '../lib/validate';
import { actorFrom, recordAudit } from '../services/audit';
import { assertBranchAccess, canAccessBranch, defaultBranchId, optionalBranchWhere } from '../services/branch-scope';
import { nextDocumentNumber } from '../services/document-numbers';
import { renderExpensePdf } from '../services/expense-pdf';
import { notifyPermission } from '../services/notifications';
import { getCompanySettings } from '../services/company-settings';
import { pdfCompany } from '../services/pdf-company';
import { deleteRecord, onlyWhen } from '../services/delete-record';

/**
 * General expenses and Tender-In / Tender-Out transactions. Records are never deleted:
 * a pending record can be edited, approved or rejected; an approved one can only be voided.
 */
export const expensesRouter = Router();

const include = {
  branch: { select: { id: true, code: true, name: true } },
  createdBy: { select: { fullName: true } },
  approvedBy: { select: { fullName: true } },
} satisfies Prisma.ExpenseInclude;

type ExpenseRow = Prisma.ExpenseGetPayload<{ include: typeof include }>;

function toDto(e: ExpenseRow): ExpenseDto {
  return {
    id: e.id,
    number: e.number,
    kind: e.kind,
    transactionDate: isoDateOnly(e.transactionDate),
    currency: e.currency as ExpenseDto['currency'],
    amount: decimalString(e.amount),
    category: e.category,
    counterparty: e.counterparty,
    tenderReference: e.tenderReference,
    paymentMethod: e.paymentMethod,
    paymentReference: e.paymentReference,
    description: e.description,
    status: e.status,
    statusReason: e.statusReason,
    branch: e.branch,
    recordedBy: e.createdBy.fullName.trim(),
    approvedBy: e.approvedBy?.fullName.trim() ?? null,
    approvedAt: e.approvedAt ? iso(e.approvedAt) : null,
    createdAt: iso(e.createdAt),
    updatedAt: iso(e.updatedAt),
  };
}

async function loadExpense(db: Db, ctx: AuthContext, id: string): Promise<ExpenseRow> {
  const row = await db.expense.findUnique({ where: { id }, include });
  // Records of a branch the user can't see are reported as missing, not forbidden.
  if (!row || !canAccessBranch(ctx, row.branchId)) throw notFound('The record');
  return row;
}

async function checkBranch(tx: Tx, ctx: AuthContext, branchId: string | null | undefined) {
  if (!branchId) return;
  assertBranchAccess(ctx, branchId);
  const branch = await tx.branch.findUnique({ where: { id: branchId }, select: { isActive: true } });
  if (!branch || !branch.isActive) {
    throw new AppError('VALIDATION_FAILED', 'Choose an active branch.', { branchId: 'Choose an active branch.' });
  }
}

expensesRouter.use(requirePermission('expenses.read'));

/** Categories already used for a kind, for the form's suggestions. */
expensesRouter.get('/categories', async (req, res) => {
  const { kind } = parse(z.object({ kind: z.enum(EXPENSE_KINDS) }), req.query);
  const rows = await prisma.expense.findMany({
    where: { kind },
    distinct: ['category'],
    select: { category: true },
    orderBy: { category: 'asc' },
    take: 50,
  });
  ok(res, rows.map((r) => r.category));
});

expensesRouter.get('/', async (req, res) => {
  const ctx = getAuth(req);
  const query = parse(expenseListQuerySchema, req.query);
  const and: Prisma.ExpenseWhereInput[] = [{ kind: query.kind }, optionalBranchWhere(ctx)];
  if (query.status) and.push({ status: query.status });
  if (query.dateFrom) and.push({ transactionDate: { gte: dateFromIso(query.dateFrom) } });
  if (query.dateTo) and.push({ transactionDate: { lte: dateFromIso(query.dateTo) } });
  if (query.q) {
    and.push({
      OR: [
        { number: { contains: query.q, mode: 'insensitive' } },
        { counterparty: { contains: query.q, mode: 'insensitive' } },
        { category: { contains: query.q, mode: 'insensitive' } },
        { tenderReference: { contains: query.q, mode: 'insensitive' } },
      ],
    });
  }
  const where: Prisma.ExpenseWhereInput = { AND: and };
  const sort = orderBy<Prisma.ExpenseOrderByWithRelationInput[]>(
    query.sort,
    {
      number: (dir) => [{ number: dir }],
      transactionDate: (dir) => [{ transactionDate: dir }, { number: dir }],
      amount: (dir) => [{ amount: dir }],
      category: (dir) => [{ category: dir }],
      counterparty: (dir) => [{ counterparty: dir }],
      status: (dir) => [{ status: dir }],
    },
    [{ transactionDate: 'desc' }, { number: 'desc' }],
  );
  const [rows, total] = await Promise.all([
    prisma.expense.findMany({ where, orderBy: sort, include, ...pageWindow(query) }),
    prisma.expense.count({ where }),
  ]);
  ok(res, rows.map(toDto), pageMeta(query, total));
});

expensesRouter.get('/:id', async (req, res) => {
  ok(res, toDto(await loadExpense(prisma, getAuth(req), parse(uuid, req.params.id))));
});

expensesRouter.get('/:id/pdf', async (req, res) => {
  const expense = toDto(await loadExpense(prisma, getAuth(req), parse(uuid, req.params.id)));
  const pdf = await renderExpensePdf(expense, await pdfCompany(EXPENSE_KIND_LABELS[expense.kind]));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${expense.number}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
});

expensesRouter.post('/', requirePermission('expenses.manage'), idempotent, async (req, res) => {
  const ctx = getAuth(req);
  const input = parse(expenseInputSchema, req.body);
  const row = await prisma.$transaction(async (tx) => {
    await checkBranch(tx, ctx, input.branchId);
    const number = await nextDocumentNumber(tx, 'expense', { date: dateFromIso(input.transactionDate) });
    const expense = await tx.expense.create({
      data: {
        number,
        kind: input.kind,
        transactionDate: dateFromIso(input.transactionDate),
        currency: input.currency,
        amount: input.amount,
        category: input.category,
        counterparty: input.counterparty ?? null,
        tenderReference: input.tenderReference ?? null,
        paymentMethod: input.paymentMethod,
        paymentReference: input.paymentReference ?? null,
        description: input.description ?? null,
        branchId: input.branchId ?? defaultBranchId(ctx),
        createdById: ctx.profileId,
      },
      include,
    });
    await recordAudit(tx, actorFrom(req), {
      action: 'expense.created',
      entityType: 'expense',
      entityId: expense.id,
      summary: `${EXPENSE_KIND_LABELS[expense.kind]} ${expense.number} recorded (${input.currency} ${input.amount})`,
    });
    await notifyPermission(tx, 'expenses.approve', expense.branchId, ctx.profileId, {
      type: 'expense_approval',
      title: `${expense.number} is awaiting approval`,
      body: `${input.currency} ${input.amount}, ${input.category}`,
      link: `/expenses/${expense.kind.replace('_', '-')}?status=pending`,
      dedupeKey: `expense-approval:${expense.id}`,
    });
    return expense;
  });
  created(res, toDto(row));
});

expensesRouter.put('/:id', requirePermission('expenses.manage'), async (req, res) => {
  const ctx = getAuth(req);
  const id = parse(uuid, req.params.id);
  const input = parse(expenseUpdateSchema, req.body);
  const row = await prisma.$transaction(async (tx) => {
    const before = await loadExpense(tx, ctx, id);
    if (before.status !== 'pending') {
      throw invalidState('Only records awaiting approval can be edited. Void it and record a new one instead.');
    }
    await checkBranch(tx, ctx, input.branchId);
    const updated = await tx.expense.update({
      where: { id },
      data: {
        transactionDate: dateFromIso(input.transactionDate),
        currency: input.currency,
        amount: input.amount,
        category: input.category,
        counterparty: input.counterparty ?? null,
        tenderReference: input.tenderReference ?? null,
        paymentMethod: input.paymentMethod,
        paymentReference: input.paymentReference ?? null,
        description: input.description ?? null,
        branchId: input.branchId ?? null,
      },
      include,
    });
    await recordAudit(tx, actorFrom(req), {
      action: 'expense.updated',
      entityType: 'expense',
      entityId: id,
      summary: `${EXPENSE_KIND_LABELS[before.kind]} ${before.number} updated`,
    });
    return updated;
  });
  ok(res, toDto(row));
});

expensesRouter.post('/:id/status', requirePermission('expenses.approve'), async (req, res) => {
  const ctx = getAuth(req);
  const id = parse(uuid, req.params.id);
  const { status, reason } = parse(expenseStatusSchema, req.body);
  const row = await prisma.$transaction(async (tx) => {
    const before = await loadExpense(tx, ctx, id);
    if (before.status === status) return before;
    if (!EXPENSE_TRANSITIONS[before.status].includes(status)) {
      throw invalidState(
        `A record that is ${EXPENSE_STATUS_LABELS[before.status].toLowerCase()} can't be marked ${EXPENSE_STATUS_LABELS[status].toLowerCase()}.`,
      );
    }
    if (status === 'approved' && !can(ctx, 'expenses.approve_large')) {
      const { expenseApprovalLimit } = await getCompanySettings(tx);
      if (expenseApprovalLimit && before.amount.gt(expenseApprovalLimit)) {
        throw new AppError(
          'FORBIDDEN',
          `This record is above the approval limit of ${expenseApprovalLimit}, so an administrator has to approve it.`,
        );
      }
    }
    if ((status === 'rejected' || status === 'voided') && !reason) {
      throw new AppError('VALIDATION_FAILED', 'Give a reason.', { reason: 'Give a reason.' });
    }
    // Guard against two approvers acting at once: only update if the status is unchanged.
    const { count } = await tx.expense.updateMany({
      where: { id, status: before.status },
      data: {
        status,
        statusReason: reason ?? null,
        ...(status === 'approved' ? { approvedById: ctx.profileId, approvedAt: new Date() } : {}),
      },
    });
    if (count === 0) throw invalidState('Someone else changed this record just now. Reload it and try again.');
    await recordAudit(tx, actorFrom(req), {
      action: 'expense.status_changed',
      entityType: 'expense',
      entityId: id,
      summary: `${EXPENSE_KIND_LABELS[before.kind]} ${before.number} changed from ${before.status} to ${status}${reason ? ` (${reason})` : ''}`,
    });
    return loadExpense(tx, ctx, id);
  });
  ok(res, toDto(row));
});

/** Deletes a record nothing depends on; anything already in use is cancelled or archived instead. */
expensesRouter.delete('/:id', requirePermission('expenses.manage'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  await deleteRecord(req, 'expense', id, 'record', async (tx) => {
    const row = await loadExpense(tx, getAuth(req), id);
    onlyWhen(row.status, ['pending', 'rejected'], `Record ${row.number} has been approved and can't be deleted. Void it instead.`);
    await tx.expense.delete({ where: { id } });
    return `Expense ${row.number} deleted`;
  });
  res.status(204).end();
});
