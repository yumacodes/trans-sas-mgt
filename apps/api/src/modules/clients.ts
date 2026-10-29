import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import {
  clientInputSchema,
  clientListQuerySchema,
  uuid,
  type ClientDto,
  type ClientOptionDto,
} from '@tsm/shared';
import { z } from 'zod';
import { getAuth, requirePermission, type AuthContext } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { AppError, forbidden, invalidState, notFound } from '../lib/errors';
import { orderBy, pageMeta, pageWindow } from '../lib/pagination';
import { prisma, type Tx } from '../lib/prisma';
import { created, ok } from '../lib/respond';
import { iso, optionalIsoDateOnly } from '../lib/serialize';
import { parse } from '../lib/validate';
import { actorFrom, diff, recordAudit } from '../services/audit';
import { assertBranchAccess, canAccessBranch, optionalBranchWhere } from '../services/branch-scope';
import { nextDocumentNumber } from '../services/document-numbers';

export const clientsRouter = Router();

export const clientInclude = {
  branch: { select: { id: true, code: true, name: true } },
  accountOwner: { select: { id: true, fullName: true } },
  registrations: {
    where: { status: 'active' as const },
    select: { id: true, registrationNumber: true, validUntil: true },
    take: 1,
  },
} as const;

type ClientRow = Prisma.ClientGetPayload<{ include: typeof clientInclude }>;

export function toClientDto(c: ClientRow): ClientDto {
  const reg = c.registrations[0];
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    organizationType: c.organizationType,
    contactPerson: c.contactPerson,
    email: c.email,
    phone: c.phone,
    billingAddress: c.billingAddress,
    deliveryAddress: c.deliveryAddress,
    taxId: c.taxId,
    notes: c.notes,
    status: c.status,
    branch: c.branch,
    accountOwner: c.accountOwner,
    activeRegistration: reg
      ? { id: reg.id, registrationNumber: reg.registrationNumber, validUntil: optionalIsoDateOnly(reg.validUntil) }
      : null,
    createdAt: iso(c.createdAt),
    updatedAt: iso(c.updatedAt),
  };
}

/** Load a client the caller is allowed to see, or fail with 404/403. */
export async function findAccessibleClient(db: Tx | typeof prisma, ctx: AuthContext, id: string) {
  const client = await db.client.findUnique({ where: { id }, include: clientInclude });
  if (!client) throw notFound('The client');
  if (!canAccessBranch(ctx, client.branchId)) throw forbidden();
  return client;
}

async function validateReferences(tx: Tx, ctx: AuthContext, branchId?: string | null, ownerId?: string | null) {
  if (branchId) {
    assertBranchAccess(ctx, branchId);
    const branch = await tx.branch.findUnique({ where: { id: branchId } });
    if (!branch || !branch.isActive) {
      throw new AppError('VALIDATION_FAILED', 'Select an active branch.', { branchId: 'Select an active branch.' });
    }
  }
  if (ownerId) {
    const owner = await tx.userProfile.findUnique({ where: { id: ownerId } });
    if (!owner || !owner.isActive) {
      throw new AppError('VALIDATION_FAILED', 'Select an active user as account owner.', {
        accountOwnerId: 'Select an active user as account owner.',
      });
    }
  }
}

clientsRouter.use(requirePermission('clients.read'));

clientsRouter.get('/options', async (req, res) => {
  const ctx = getAuth(req);
  const { q } = parse(z.object({ q: z.string().trim().max(100).optional() }), req.query);
  const rows = await prisma.client.findMany({
    where: {
      status: 'active',
      ...optionalBranchWhere(ctx),
      ...(q
        ? {
            AND: [
              {
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { code: { contains: q, mode: 'insensitive' } },
                ],
              },
            ],
          }
        : {}),
    },
    select: { id: true, code: true, name: true },
    orderBy: { name: 'asc' },
    take: 20,
  });
  ok<ClientOptionDto[]>(res, rows);
});

clientsRouter.get('/', async (req, res) => {
  const ctx = getAuth(req);
  const query = parse(clientListQuerySchema, req.query);
  if (query.branchId) assertBranchAccess(ctx, query.branchId);
  const and: Prisma.ClientWhereInput[] = [optionalBranchWhere(ctx)];
  if (query.status) and.push({ status: query.status });
  if (query.organizationType) and.push({ organizationType: query.organizationType });
  if (query.branchId) and.push({ branchId: query.branchId });
  if (query.q) {
    and.push({
      OR: [
        { name: { contains: query.q, mode: 'insensitive' } },
        { code: { contains: query.q, mode: 'insensitive' } },
        { contactPerson: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
        { phone: { contains: query.q } },
      ],
    });
  }
  const where: Prisma.ClientWhereInput = { AND: and };
  const sort = orderBy<Prisma.ClientOrderByWithRelationInput>(
    query.sort,
    {
      name: (dir) => ({ name: dir }),
      code: (dir) => ({ code: dir }),
      createdAt: (dir) => ({ createdAt: dir }),
    },
    { name: 'asc' },
  );
  const [rows, total] = await Promise.all([
    prisma.client.findMany({ where, orderBy: sort, include: clientInclude, ...pageWindow(query) }),
    prisma.client.count({ where }),
  ]);
  ok(res, rows.map(toClientDto), pageMeta(query, total));
});

clientsRouter.get('/:id', async (req, res) => {
  const id = parse(uuid, req.params.id);
  ok(res, toClientDto(await findAccessibleClient(prisma, getAuth(req), id)));
});

clientsRouter.post('/', requirePermission('clients.create'), idempotent, async (req, res) => {
  const ctx = getAuth(req);
  const input = parse(clientInputSchema, req.body);
  const client = await prisma.$transaction(async (tx) => {
    await validateReferences(tx, ctx, input.branchId, input.accountOwnerId);
    const code = await nextDocumentNumber(tx, 'client');
    const row = await tx.client.create({
      data: {
        ...input,
        branchId: input.branchId ?? null,
        accountOwnerId: input.accountOwnerId ?? null,
        code,
        createdById: ctx.profileId,
      },
      include: clientInclude,
    });
    await recordAudit(tx, actorFrom(req), {
      action: 'client.created',
      entityType: 'client',
      entityId: row.id,
      summary: `Client ${row.code} – ${row.name} created`,
    });
    return row;
  });
  created(res, toClientDto(client));
});

const AUDITED = [
  'name',
  'organizationType',
  'contactPerson',
  'email',
  'phone',
  'billingAddress',
  'deliveryAddress',
  'taxId',
  'notes',
  'branchId',
  'accountOwnerId',
] as const;

clientsRouter.put('/:id', requirePermission('clients.update'), async (req, res) => {
  const ctx = getAuth(req);
  const id = parse(uuid, req.params.id);
  const input = parse(clientInputSchema, req.body);
  const client = await prisma.$transaction(async (tx) => {
    const before = await findAccessibleClient(tx, ctx, id);
    if (before.status === 'archived') throw invalidState('Restore this client before editing it.');
    await validateReferences(tx, ctx, input.branchId, input.accountOwnerId);
    const data = { ...input, branchId: input.branchId ?? null, accountOwnerId: input.accountOwnerId ?? null };
    const row = await tx.client.update({ where: { id }, data, include: clientInclude });
    await recordAudit(tx, actorFrom(req), {
      action: 'client.updated',
      entityType: 'client',
      entityId: id,
      summary: `Client ${row.code} updated`,
      changes: diff(before as unknown as Record<string, unknown>, data, [...AUDITED]),
    });
    return row;
  });
  ok(res, toClientDto(client));
});

/** Clients are archived, never deleted, so historical documents keep their party. */
for (const action of ['archive', 'restore'] as const) {
  clientsRouter.post(`/:id/${action}`, requirePermission('clients.archive'), async (req, res) => {
    const ctx = getAuth(req);
    const id = parse(uuid, req.params.id);
    const client = await prisma.$transaction(async (tx) => {
      const before = await findAccessibleClient(tx, ctx, id);
      const status = action === 'archive' ? 'archived' : 'active';
      if (before.status === status) return before;
      const row = await tx.client.update({
        where: { id },
        data: { status, archivedAt: action === 'archive' ? new Date() : null },
        include: clientInclude,
      });
      await recordAudit(tx, actorFrom(req), {
        action: `client.${action}d`,
        entityType: 'client',
        entityId: id,
        summary: `Client ${row.code} ${action === 'archive' ? 'archived' : 'restored'}`,
      });
      return row;
    });
    ok(res, toClientDto(client));
  });
}
