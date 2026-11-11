import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  clientInputSchema,
  ORGANIZATION_TYPES,
  stockItemInputSchema,
  type ImportResultDto,
  type ImportRowResult,
} from '@tsm/shared';
import { can, getAuth, requirePermission } from '../middleware/auth';
import { AppError, fieldsFromZod } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { ok } from '../lib/respond';
import { parse } from '../lib/validate';
import { actorFrom, recordAudit } from '../services/audit';
import { canAccessBranch, defaultBranchId } from '../services/branch-scope';
import { nextDocumentNumber } from '../services/document-numbers';
import { recordMovement } from '../services/inventory';

/**
 * Spreadsheet imports. The browser reads the file and sends its rows; every row is checked
 * again here. With `commit: false` nothing is saved and each row's outcome is returned, so
 * the user sees problems first. With `commit: true` the valid rows are saved together in one
 * transaction and invalid or duplicate rows are skipped, so they can't corrupt the rest.
 */
export const importsRouter = Router();

const MAX_ROWS = 1000;
const body = z.object({
  commit: z.boolean().default(false),
  rows: z.array(z.record(z.string(), z.unknown())).min(1, 'The file has no rows.').max(MAX_ROWS, `Import up to ${MAX_ROWS} rows at a time.`),
});

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const firstIssue = (error: z.ZodError) => Object.values(fieldsFromZod(error))[0] ?? 'This row is not valid.';

function summary(results: ImportRowResult[], created: number, committed: boolean): ImportResultDto {
  return {
    committed,
    created,
    valid: results.filter((r) => r.status === 'valid').length,
    invalid: results.filter((r) => r.status === 'error').length,
    duplicates: results.filter((r) => r.status === 'duplicate').length,
    results,
  };
}

/* ---------- Stock items ---------- */

importsRouter.post('/stock-items', requirePermission('stock_items.create'), async (req, res) => {
  const ctx = getAuth(req);
  const { rows, commit } = parse(body, req.body);
  const categories = new Map(
    (await prisma.stockCategory.findMany({ where: { isActive: true } })).map((c) => [c.name.toLowerCase(), c.id]),
  );
  const existing = new Set((await prisma.stockItem.findMany({ select: { sku: true } })).map((s) => s.sku));
  const seen = new Set<string>();
  const results: ImportRowResult[] = [];
  const valid: { row: number; data: z.output<typeof stockItemInputSchema> }[] = [];

  rows.forEach((raw, index) => {
    const row = index + 2; // Spreadsheet row, after the header.
    const category = text(raw.category);
    const categoryId = category ? categories.get(category.toLowerCase()) : null;
    if (category && !categoryId) {
      results.push({ row, status: 'error', message: `There is no active category called "${category}".` });
      return;
    }
    const parsed = stockItemInputSchema.safeParse({
      sku: text(raw.sku),
      name: text(raw.name),
      description: text(raw.description),
      categoryId,
      brand: text(raw.brand),
      model: text(raw.model),
      unit: text(raw.unit) || 'unit',
      purchaseCost: text(raw.purchaseCost),
      sellingPrice: text(raw.sellingPrice),
      reorderLevel: text(raw.reorderLevel) || 0,
      trackingMode: text(raw.trackingMode) || 'none',
      warrantyMonths: text(raw.warrantyMonths),
      tracksExpiry: ['yes', 'true', '1'].includes(text(raw.tracksExpiry).toLowerCase()),
    });
    if (!parsed.success) {
      results.push({ row, status: 'error', message: firstIssue(parsed.error) });
      return;
    }
    const sku = parsed.data.sku;
    if (existing.has(sku) || seen.has(sku)) {
      results.push({ row, status: 'duplicate', message: `Item code ${sku} ${existing.has(sku) ? 'already exists' : 'appears twice in the file'}.` });
      return;
    }
    seen.add(sku);
    results.push({ row, status: 'valid', message: null });
    valid.push({ row, data: parsed.data });
  });

  if (!commit || valid.length === 0) return ok(res, summary(results, 0, false));

  const approved = can(ctx, 'stock_items.approve');
  await prisma.$transaction(
    async (tx) => {
      await tx.stockItem.createMany({
        data: valid.map(({ data }) => ({
          ...data,
          categoryId: data.categoryId ?? null,
          warrantyMonths: data.warrantyMonths ?? null,
          purchaseCost: can(ctx, 'stock_items.view_cost') ? data.purchaseCost : null,
          createdById: ctx.profileId,
          approvalStatus: approved ? ('approved' as const) : ('pending' as const),
          ...(approved ? { approvedById: ctx.profileId, approvedAt: new Date() } : {}),
        })),
      });
      await recordAudit(tx, actorFrom(req), {
        action: 'stock_item.imported',
        entityType: 'stock_item',
        summary: `${valid.length} stock item(s) imported from a spreadsheet; ${results.length - valid.length} row(s) skipped`,
      });
    },
    { timeout: 60_000 },
  );
  ok(res, summary(results, valid.length, true));
});

/* ---------- Clients ---------- */

importsRouter.post('/clients', requirePermission('clients.create'), async (req, res) => {
  const ctx = getAuth(req);
  const { rows, commit } = parse(body, req.body);
  const existing = new Set(
    (await prisma.client.findMany({ where: { status: 'active' }, select: { name: true } })).map((c) => c.name.toLowerCase()),
  );
  const seen = new Set<string>();
  const results: ImportRowResult[] = [];
  const valid: z.output<typeof clientInputSchema>[] = [];

  rows.forEach((raw, index) => {
    const row = index + 2;
    const type = text(raw.organizationType).toLowerCase().replace(/\s+/g, '_');
    const parsed = clientInputSchema.safeParse({
      name: text(raw.name),
      organizationType: (ORGANIZATION_TYPES as readonly string[]).includes(type) ? type : type || undefined,
      contactPerson: text(raw.contactPerson),
      email: text(raw.email),
      phone: text(raw.phone),
      billingAddress: text(raw.billingAddress),
      deliveryAddress: text(raw.deliveryAddress),
      taxId: text(raw.taxId),
      notes: text(raw.notes),
    });
    if (!parsed.success) {
      results.push({ row, status: 'error', message: firstIssue(parsed.error) });
      return;
    }
    const key = parsed.data.name.toLowerCase();
    if (existing.has(key) || seen.has(key)) {
      results.push({ row, status: 'duplicate', message: `${parsed.data.name} ${existing.has(key) ? 'is already a client' : 'appears twice in the file'}.` });
      return;
    }
    seen.add(key);
    results.push({ row, status: 'valid', message: null });
    valid.push(parsed.data);
  });

  if (!commit || valid.length === 0) return ok(res, summary(results, 0, false));

  await prisma.$transaction(
    async (tx) => {
      for (const data of valid) {
        await tx.client.create({
          data: {
            ...data,
            code: await nextDocumentNumber(tx, 'client'),
            branchId: defaultBranchId(ctx),
            createdById: ctx.profileId,
          },
        });
      }
      await recordAudit(tx, actorFrom(req), {
        action: 'client.imported',
        entityType: 'client',
        summary: `${valid.length} client(s) imported from a spreadsheet; ${results.length - valid.length} row(s) skipped`,
      });
    },
    { timeout: 60_000 },
  );
  ok(res, summary(results, valid.length, true));
});

/* ---------- Opening stock balances ---------- */

importsRouter.post('/opening-balances', requirePermission('inventory.adjust'), async (req, res) => {
  const ctx = getAuth(req);
  const { rows, commit } = parse(body, req.body);
  const items = new Map(
    (await prisma.stockItem.findMany({ where: { isActive: true }, select: { id: true, sku: true } })).map((i) => [i.sku, i.id]),
  );
  const branches = new Map(
    (await prisma.branch.findMany({ where: { isActive: true }, select: { id: true, code: true } })).map((b) => [b.code.toUpperCase(), b.id]),
  );
  // An opening balance is only for an item and branch with no stock history yet.
  const started = new Set(
    (await prisma.stockMovement.groupBy({ by: ['itemId', 'branchId'] })).map((m) => `${m.itemId}:${m.branchId}`),
  );
  const seen = new Set<string>();
  const results: ImportRowResult[] = [];
  const valid: { itemId: string; branchId: string; quantity: string; unitCost: string | null; sku: string }[] = [];

  rows.forEach((raw, index) => {
    const row = index + 2;
    const sku = text(raw.sku).toUpperCase();
    const branchCode = text(raw.branchCode).toUpperCase();
    const quantity = text(raw.quantity);
    const unitCost = text(raw.unitCost);
    const itemId = items.get(sku);
    const branchId = branches.get(branchCode);
    const fail = (message: string) => results.push({ row, status: 'error', message });
    if (!itemId) return fail(`There is no active item with code "${sku}".`);
    if (!branchId) return fail(`There is no active branch with code "${branchCode}".`);
    if (!canAccessBranch(ctx, branchId)) return fail(`You can't record stock for branch ${branchCode}.`);
    if (!/^\d{1,12}(\.\d{1,3})?$/.test(quantity) || Number(quantity) <= 0) return fail('Enter a quantity greater than zero.');
    if (unitCost && !/^\d{1,14}(\.\d{1,4})?$/.test(unitCost)) return fail('Unit cost must be a number.');
    const key = `${itemId}:${branchId}`;
    if (started.has(key) || seen.has(key)) {
      results.push({ row, status: 'duplicate', message: `${sku} at ${branchCode} already has stock history, so it can't get an opening balance.` });
      return;
    }
    seen.add(key);
    results.push({ row, status: 'valid', message: null });
    valid.push({ itemId, branchId, quantity, unitCost: unitCost || null, sku });
  });

  if (!commit || valid.length === 0) return ok(res, summary(results, 0, false));

  await prisma.$transaction(
    async (tx) => {
      for (const v of valid) {
        await recordMovement(tx, {
          itemId: v.itemId,
          branchId: v.branchId,
          type: 'opening_balance',
          quantity: new Prisma.Decimal(v.quantity),
          unitCost: v.unitCost,
          sourceType: 'import',
          reference: 'Opening balance import',
          actorId: ctx.profileId,
        });
      }
      await recordAudit(tx, actorFrom(req), {
        action: 'stock.opening_imported',
        entityType: 'stock_movement',
        summary: `${valid.length} opening balance(s) imported from a spreadsheet`,
      });
    },
    { timeout: 60_000 },
  );
  ok(res, summary(results, valid.length, true));
});

importsRouter.use(() => {
  throw new AppError('NOT_FOUND', 'That import does not exist.');
});
