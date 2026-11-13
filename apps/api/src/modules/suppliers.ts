import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import {
  supplierInputSchema,
  supplierListQuerySchema,
  supplierStatusSchema,
  uuid,
  type SupplierDto,
} from '@tsm/shared';
import { getAuth, requirePermission } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { notFound } from '../lib/errors';
import { orderBy, pageMeta, pageWindow } from '../lib/pagination';
import { prisma, type Db } from '../lib/prisma';
import { created, ok } from '../lib/respond';
import { iso } from '../lib/serialize';
import { parse } from '../lib/validate';
import { actorFrom, recordAudit } from '../services/audit';
import { nextDocumentNumber } from '../services/document-numbers';
import { deleteRecord, onlyWhen } from '../services/delete-record';

/** Suppliers are shared by every branch and kept separate from clients. */
export const suppliersRouter = Router();

const include = { _count: { select: { purchases: true } } } satisfies Prisma.SupplierInclude;
type SupplierRow = Prisma.SupplierGetPayload<{ include: typeof include }>;

function toDto(s: SupplierRow): SupplierDto {
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    contactPerson: s.contactPerson,
    email: s.email,
    phone: s.phone,
    address: s.address,
    taxId: s.taxId,
    notes: s.notes,
    isActive: s.isActive,
    purchaseCount: s._count.purchases,
    createdAt: iso(s.createdAt),
    updatedAt: iso(s.updatedAt),
  };
}

async function loadSupplier(db: Db, id: string) {
  const row = await db.supplier.findUnique({ where: { id }, include });
  if (!row) throw notFound('The supplier');
  return row;
}

suppliersRouter.use(requirePermission('purchases.read'));

suppliersRouter.get('/', async (req, res) => {
  const query = parse(supplierListQuerySchema, req.query);
  const and: Prisma.SupplierWhereInput[] = [];
  if (query.isActive) and.push({ isActive: query.isActive === 'true' });
  if (query.q) {
    and.push({
      OR: [
        { name: { contains: query.q, mode: 'insensitive' } },
        { code: { contains: query.q, mode: 'insensitive' } },
        { contactPerson: { contains: query.q, mode: 'insensitive' } },
      ],
    });
  }
  const where: Prisma.SupplierWhereInput = { AND: and };
  const sort = orderBy<Prisma.SupplierOrderByWithRelationInput>(
    query.sort,
    { name: (dir) => ({ name: dir }), code: (dir) => ({ code: dir }), createdAt: (dir) => ({ createdAt: dir }) },
    { name: 'asc' },
  );
  const [rows, total] = await Promise.all([
    prisma.supplier.findMany({ where, orderBy: sort, include, ...pageWindow(query) }),
    prisma.supplier.count({ where }),
  ]);
  ok(res, rows.map(toDto), pageMeta(query, total));
});

suppliersRouter.get('/:id', async (req, res) => {
  ok(res, toDto(await loadSupplier(prisma, parse(uuid, req.params.id))));
});

suppliersRouter.post('/', requirePermission('purchases.manage'), idempotent, async (req, res) => {
  const ctx = getAuth(req);
  const input = parse(supplierInputSchema, req.body);
  const row = await prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.create({
      data: {
        ...input,
        code: await nextDocumentNumber(tx, 'supplier'),
        createdById: ctx.profileId,
      },
      include,
    });
    await recordAudit(tx, actorFrom(req), {
      action: 'supplier.created',
      entityType: 'supplier',
      entityId: supplier.id,
      summary: `Supplier ${supplier.code} ${supplier.name} added`,
    });
    return supplier;
  });
  created(res, toDto(row));
});

suppliersRouter.put('/:id', requirePermission('purchases.manage'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  const input = parse(supplierInputSchema, req.body);
  const row = await prisma.$transaction(async (tx) => {
    const before = await loadSupplier(tx, id);
    const updated = await tx.supplier.update({ where: { id }, data: input, include });
    await recordAudit(tx, actorFrom(req), {
      action: 'supplier.updated',
      entityType: 'supplier',
      entityId: id,
      summary: `Supplier ${before.code} updated`,
    });
    return updated;
  });
  ok(res, toDto(row));
});

suppliersRouter.patch('/:id/status', requirePermission('purchases.manage'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  const { isActive } = parse(supplierStatusSchema, req.body);
  const row = await prisma.$transaction(async (tx) => {
    const before = await loadSupplier(tx, id);
    const updated = await tx.supplier.update({ where: { id }, data: { isActive }, include });
    await recordAudit(tx, actorFrom(req), {
      action: isActive ? 'supplier.activated' : 'supplier.deactivated',
      entityType: 'supplier',
      entityId: id,
      summary: `Supplier ${before.code} ${isActive ? 'activated' : 'deactivated'}`,
    });
    return updated;
  });
  ok(res, toDto(row));
});

/** Deletes a record nothing depends on; anything already in use is cancelled or archived instead. */
suppliersRouter.delete('/:id', requirePermission('purchases.manage'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  await deleteRecord(req, 'supplier', id, 'supplier', async (tx) => {
    const row = await loadSupplier(tx, id);
    await tx.supplier.delete({ where: { id } });
    return `Supplier ${row.code} deleted`;
  });
  res.status(204).end();
});
