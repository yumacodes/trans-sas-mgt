import { Router } from 'express';
import { stockCategoryInputSchema, uuid, type StockCategoryDto } from '@tsm/shared';
import { z } from 'zod';
import { requirePermission } from '../middleware/auth';
import { AppError, notFound, withFriendlyErrors } from '../lib/errors';
import { prisma, type Tx } from '../lib/prisma';
import { created, ok } from '../lib/respond';
import { parse } from '../lib/validate';
import { actorFrom, diff, recordAudit } from '../services/audit';

export const stockCategoriesRouter = Router();

const DUPLICATE = { name: 'A category with this name already exists.' };

const include = { _count: { select: { items: true } } } as const;

/** Category names are unique regardless of letter case. */
async function assertNameAvailable(tx: Tx, name: string, exceptId?: string) {
  const clash = await tx.stockCategory.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
  });
  if (clash) throw new AppError('DUPLICATE', DUPLICATE.name, { name: DUPLICATE.name });
}

function toDto(c: {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  _count: { items: number };
}): StockCategoryDto {
  return { id: c.id, name: c.name, description: c.description, isActive: c.isActive, itemCount: c._count.items };
}

stockCategoriesRouter.get('/', requirePermission('stock_items.read'), async (_req, res) => {
  const rows = await prisma.stockCategory.findMany({ include, orderBy: { name: 'asc' } });
  ok(res, rows.map(toDto));
});

stockCategoriesRouter.post('/', requirePermission('stock_items.create'), async (req, res) => {
  const input = parse(stockCategoryInputSchema, req.body);
  const row = await withFriendlyErrors(
    () =>
      prisma.$transaction(async (tx) => {
        await assertNameAvailable(tx, input.name);
        const category = await tx.stockCategory.create({
          data: { name: input.name, description: input.description ?? null },
          include,
        });
        await recordAudit(tx, actorFrom(req), {
          action: 'stock_category.created',
          entityType: 'stock_category',
          entityId: category.id,
          summary: `Stock category "${category.name}" created`,
        });
        return category;
      }),
    DUPLICATE,
  );
  created(res, toDto(row));
});

stockCategoriesRouter.put('/:id', requirePermission('stock_items.update'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  const input = parse(stockCategoryInputSchema, req.body);
  const row = await withFriendlyErrors(
    () =>
      prisma.$transaction(async (tx) => {
        const before = await tx.stockCategory.findUnique({ where: { id } });
        if (!before) throw notFound('The category');
        await assertNameAvailable(tx, input.name, id);
        const data = { name: input.name, description: input.description ?? null };
        const category = await tx.stockCategory.update({ where: { id }, data, include });
        await recordAudit(tx, actorFrom(req), {
          action: 'stock_category.updated',
          entityType: 'stock_category',
          entityId: id,
          summary: `Stock category "${category.name}" updated`,
          changes: diff(before, data, ['name', 'description']),
        });
        return category;
      }),
    DUPLICATE,
  );
  ok(res, toDto(row));
});

stockCategoriesRouter.patch('/:id/status', requirePermission('stock_items.update'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  const { isActive } = parse(z.object({ isActive: z.boolean() }), req.body);
  const row = await prisma.$transaction(async (tx) => {
    const before = await tx.stockCategory.findUnique({ where: { id } });
    if (!before) throw notFound('The category');
    const category = await tx.stockCategory.update({ where: { id }, data: { isActive }, include });
    if (before.isActive !== isActive) {
      await recordAudit(tx, actorFrom(req), {
        action: isActive ? 'stock_category.activated' : 'stock_category.deactivated',
        entityType: 'stock_category',
        entityId: id,
        summary: `Stock category "${category.name}" ${isActive ? 'activated' : 'deactivated'}`,
      });
    }
    return category;
  });
  ok(res, toDto(row));
});
