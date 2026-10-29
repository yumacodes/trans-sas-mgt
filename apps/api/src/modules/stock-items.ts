import { Router } from 'express';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import {
  STOCK_IMAGE_MAX_BYTES,
  STOCK_IMAGE_MAX_PER_ITEM,
  stockItemInputSchema,
  stockItemListQuerySchema,
  stockItemStatusSchema,
  stockMovementListQuerySchema,
  uuid,
  type StockItemDto,
  type StockMovementDto,
} from '@tsm/shared';
import {
  can,
  getAuth,
  requireAnyPermission,
  requirePermission,
  type AuthContext,
} from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { AppError, invalidState, notFound, withFriendlyErrors } from '../lib/errors';
import { orderBy, pageMeta, pageWindow } from '../lib/pagination';
import { prisma, type Tx } from '../lib/prisma';
import { created, ok } from '../lib/respond';
import { iso, optionalDecimalString } from '../lib/serialize';
import { parse } from '../lib/validate';
import { actorFrom, diff, recordAudit } from '../services/audit';
import { assertBranchAccess, branchWhere } from '../services/branch-scope';
import { isLowStock, lowStockItemIds, quantitiesByItem } from '../services/inventory';
import {
  addImages,
  listImages,
  makeImagePrimary,
  removeImage,
  thumbnailUrls,
} from '../services/stock-images';
import { balanceInclude, toBalanceDto } from './stock-balances';

export const stockItemsRouter = Router();

const DUPLICATE = { sku: 'This item code is already in use. Choose a different code or open the existing item.' };

const include = {
  category: { select: { id: true, name: true } },
  // Only the thumbnail is needed for lists and detail headers; the gallery is a
  // separate request so list responses stay small.
  images: {
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    take: 1,
    select: { file: { select: { bucket: true, path: true, deletedAt: true } } },
  },
  _count: { select: { images: true } },
} satisfies Prisma.StockItemInclude;
type Row = Prisma.StockItemGetPayload<{ include: typeof include }>;

function toDto(
  item: Row,
  ctx: AuthContext,
  quantity: Prisma.Decimal | undefined,
  primaryImageUrl: string | null,
): StockItemDto {
  const qty = quantity ?? new Prisma.Decimal(0);
  return {
    id: item.id,
    sku: item.sku,
    name: item.name,
    description: item.description,
    category: item.category,
    brand: item.brand,
    model: item.model,
    unit: item.unit,
    purchaseCost: can(ctx, 'stock_items.view_cost') ? optionalDecimalString(item.purchaseCost, 4) : null,
    sellingPrice: item.sellingPrice.toFixed(2),
    reorderLevel: item.reorderLevel,
    trackingMode: item.trackingMode,
    warrantyMonths: item.warrantyMonths,
    tracksExpiry: item.tracksExpiry,
    isActive: item.isActive,
    quantityOnHand: qty.toFixed(3),
    isLowStock: isLowStock(qty, item.reorderLevel, item.isActive),
    primaryImageUrl,
    imageCount: item._count.images,
    createdAt: iso(item.createdAt),
    updatedAt: iso(item.updatedAt),
  };
}

async function toDtos(rows: Row[], ctx: AuthContext) {
  const [quantities, thumbnails] = await Promise.all([
    quantitiesByItem(prisma, ctx, rows.map((r) => r.id)),
    thumbnailUrls(rows),
  ]);
  return rows.map((r) => toDto(r, ctx, quantities.get(r.id), thumbnails.get(r.id) ?? null));
}

async function assertCategory(tx: Tx, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const category = await tx.stockCategory.findUnique({ where: { id: categoryId } });
  if (!category || !category.isActive) {
    throw new AppError('VALIDATION_FAILED', 'Select an active category.', { categoryId: 'Select an active category.' });
  }
}

stockItemsRouter.use(requirePermission('stock_items.read'));

stockItemsRouter.get('/', async (req, res) => {
  const ctx = getAuth(req);
  const query = parse(stockItemListQuerySchema, req.query);
  const and: Prisma.StockItemWhereInput[] = [];
  if (query.categoryId) and.push({ categoryId: query.categoryId });
  if (query.isActive !== undefined) and.push({ isActive: query.isActive });
  if (query.lowStock) and.push({ id: { in: await lowStockItemIds(prisma, ctx) } });
  if (query.q) {
    and.push({
      OR: [
        { sku: { contains: query.q, mode: 'insensitive' } },
        { name: { contains: query.q, mode: 'insensitive' } },
        { brand: { contains: query.q, mode: 'insensitive' } },
        { model: { contains: query.q, mode: 'insensitive' } },
        { category: { name: { contains: query.q, mode: 'insensitive' } } },
      ],
    });
  }
  const where: Prisma.StockItemWhereInput = { AND: and };
  const sort = orderBy<Prisma.StockItemOrderByWithRelationInput>(
    query.sort,
    {
      sku: (dir) => ({ sku: dir }),
      name: (dir) => ({ name: dir }),
      sellingPrice: (dir) => ({ sellingPrice: dir }),
      createdAt: (dir) => ({ createdAt: dir }),
    },
    { name: 'asc' },
  );
  const [rows, total] = await Promise.all([
    prisma.stockItem.findMany({ where, orderBy: sort, include, ...pageWindow(query) }),
    prisma.stockItem.count({ where }),
  ]);
  ok(res, await toDtos(rows, ctx), pageMeta(query, total));
});

stockItemsRouter.get('/:id', async (req, res) => {
  const ctx = getAuth(req);
  const id = parse(uuid, req.params.id);
  const item = await prisma.stockItem.findUnique({ where: { id }, include });
  if (!item) throw notFound('The stock item');
  ok(res, (await toDtos([item], ctx))[0]);
});

stockItemsRouter.get('/:id/balances', requirePermission('inventory.read'), async (req, res) => {
  const ctx = getAuth(req);
  const id = parse(uuid, req.params.id);
  const rows = await prisma.stockBalance.findMany({
    where: { itemId: id, ...branchWhere(ctx) },
    include: balanceInclude,
    orderBy: { branch: { name: 'asc' } },
  });
  ok(res, rows.map(toBalanceDto));
});

stockItemsRouter.get('/:id/movements', requirePermission('inventory.read'), async (req, res) => {
  const ctx = getAuth(req);
  const id = parse(uuid, req.params.id);
  const query = parse(stockMovementListQuerySchema, req.query);
  if (query.branchId) assertBranchAccess(ctx, query.branchId);
  const where: Prisma.StockMovementWhereInput = {
    itemId: id,
    ...branchWhere(ctx),
    ...(query.branchId ? { branchId: query.branchId } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        branch: { select: { id: true, code: true, name: true } },
        actor: { select: { id: true, fullName: true } },
      },
      ...pageWindow(query),
    }),
    prisma.stockMovement.count({ where }),
  ]);
  const showCost = can(ctx, 'stock_items.view_cost');
  const data: StockMovementDto[] = rows.map((m) => ({
    id: m.id,
    type: m.type,
    quantity: m.quantity.toFixed(3),
    unitCost: showCost ? optionalDecimalString(m.unitCost, 4) : null,
    branch: m.branch,
    reference: m.reference,
    note: m.note,
    actor: m.actor,
    occurredAt: iso(m.occurredAt),
  }));
  ok(res, data, pageMeta(query, total));
});

/* ---------- Images ---------- */

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: STOCK_IMAGE_MAX_BYTES, files: STOCK_IMAGE_MAX_PER_ITEM },
});

stockItemsRouter.get('/:id/images', async (req, res) => {
  const id = parse(uuid, req.params.id);
  ok(res, await listImages(id));
});

/**
 * Images are uploaded after the item exists, so the "new item" form stages the chosen
 * files and sends them here as soon as the item has been created. Whoever may create an
 * item may therefore also attach its first images.
 */
stockItemsRouter.post(
  '/:id/images',
  requireAnyPermission('stock_items.create', 'stock_items.update'),
  imageUpload.array('files', STOCK_IMAGE_MAX_PER_ITEM),
  async (req, res) => {
    const ctx = getAuth(req);
    const id = parse(uuid, req.params.id);
    const files = Array.isArray(req.files) ? req.files : [];
    ok(res, await addImages(req, id, ctx.profileId, files));
  },
);

stockItemsRouter.delete('/:id/images/:imageId', requirePermission('stock_items.update'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  const imageId = parse(uuid, req.params.imageId);
  ok(res, await removeImage(req, id, imageId));
});

stockItemsRouter.patch(
  '/:id/images/:imageId/primary',
  requirePermission('stock_items.update'),
  async (req, res) => {
    const id = parse(uuid, req.params.id);
    const imageId = parse(uuid, req.params.imageId);
    ok(res, await makeImagePrimary(req, id, imageId));
  },
);

stockItemsRouter.post('/', requirePermission('stock_items.create'), idempotent, async (req, res) => {
  const ctx = getAuth(req);
  const input = parse(stockItemInputSchema, req.body);
  const item = await withFriendlyErrors(
    () =>
      prisma.$transaction(async (tx) => {
        await assertCategory(tx, input.categoryId);
        const row = await tx.stockItem.create({
          data: {
            ...input,
            categoryId: input.categoryId ?? null,
            warrantyMonths: input.warrantyMonths ?? null,
            // Cost can only be set by users who are allowed to see it.
            purchaseCost: can(ctx, 'stock_items.view_cost') ? input.purchaseCost : null,
            createdById: ctx.profileId,
          },
          include,
        });
        await recordAudit(tx, actorFrom(req), {
          action: 'stock_item.created',
          entityType: 'stock_item',
          entityId: row.id,
          summary: `Stock item ${row.sku} – ${row.name} created`,
        });
        return row;
      }),
    DUPLICATE,
  );
  created(res, toDto(item, ctx, undefined, null));
});

const AUDITED = [
  'sku',
  'name',
  'description',
  'categoryId',
  'brand',
  'model',
  'unit',
  'purchaseCost',
  'sellingPrice',
  'reorderLevel',
  'trackingMode',
  'warrantyMonths',
  'tracksExpiry',
] as const;

stockItemsRouter.put('/:id', requirePermission('stock_items.update'), async (req, res) => {
  const ctx = getAuth(req);
  const id = parse(uuid, req.params.id);
  const input = parse(stockItemInputSchema, req.body);
  const item = await withFriendlyErrors(
    () =>
      prisma.$transaction(async (tx) => {
        const before = await tx.stockItem.findUnique({ where: { id } });
        if (!before) throw notFound('The stock item');
        await assertCategory(tx, input.categoryId);
        if (before.trackingMode !== input.trackingMode || before.sku !== input.sku) {
          const movements = await tx.stockMovement.count({ where: { itemId: id } });
          if (movements > 0) {
            throw invalidState(
              'The item code and tracking method cannot change once stock has moved for this item. Create a new item instead.',
            );
          }
        }
        const { purchaseCost, ...rest } = input;
        const data = {
          ...rest,
          categoryId: input.categoryId ?? null,
          warrantyMonths: input.warrantyMonths ?? null,
          ...(can(ctx, 'stock_items.view_cost') ? { purchaseCost } : {}),
        };
        const row = await tx.stockItem.update({ where: { id }, data, include });
        await recordAudit(tx, actorFrom(req), {
          action: 'stock_item.updated',
          entityType: 'stock_item',
          entityId: id,
          summary: `Stock item ${row.sku} updated`,
          changes: diff(before as unknown as Record<string, unknown>, data, [...AUDITED]),
        });
        return row;
      }),
    DUPLICATE,
  );
  ok(res, (await toDtos([item], ctx))[0]);
});

stockItemsRouter.patch('/:id/status', requirePermission('stock_items.update'), async (req, res) => {
  const ctx = getAuth(req);
  const id = parse(uuid, req.params.id);
  const { isActive } = parse(stockItemStatusSchema, req.body);
  const item = await prisma.$transaction(async (tx) => {
    const before = await tx.stockItem.findUnique({ where: { id } });
    if (!before) throw notFound('The stock item');
    const row = await tx.stockItem.update({ where: { id }, data: { isActive }, include });
    if (before.isActive !== isActive) {
      await recordAudit(tx, actorFrom(req), {
        action: isActive ? 'stock_item.activated' : 'stock_item.deactivated',
        entityType: 'stock_item',
        entityId: id,
        summary: `Stock item ${row.sku} ${isActive ? 'activated' : 'deactivated'}`,
      });
    }
    return row;
  });
  ok(res, (await toDtos([item], ctx))[0]);
});
