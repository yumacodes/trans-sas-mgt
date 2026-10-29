import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import {
  branchInputSchema,
  branchListQuerySchema,
  branchStatusSchema,
  type BranchDto,
  type BranchRef,
} from '@tsm/shared';
import { getAuth, requirePermission } from '../middleware/auth';
import { AppError, invalidState, notFound, withFriendlyErrors } from '../lib/errors';
import { orderBy, pageMeta, pageWindow } from '../lib/pagination';
import { prisma, type Tx } from '../lib/prisma';
import { created, ok } from '../lib/respond';
import { iso } from '../lib/serialize';
import { parse } from '../lib/validate';
import { uuid } from '@tsm/shared';
import { actorFrom, diff, recordAudit } from '../services/audit';

export const branchesRouter = Router();

const DUPLICATE = { code: 'This branch code is already in use. Choose a different code.' };

const include = {
  manager: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.BranchInclude;
type Row = Prisma.BranchGetPayload<{ include: typeof include }>;

/** The manager must be an active user; they become a message audience of their own. */
async function assertManager(tx: Tx, managerUserId: string | null | undefined) {
  if (!managerUserId) return;
  const user = await tx.userProfile.findUnique({ where: { id: managerUserId } });
  if (!user || !user.isActive) {
    const message = 'Select an active user as the branch manager.';
    throw new AppError('VALIDATION_FAILED', message, { managerUserId: message });
  }
}

function toDto(b: Row): BranchDto {
  return {
    id: b.id,
    code: b.code,
    name: b.name,
    addressLine1: b.addressLine1,
    city: b.city,
    region: b.region,
    phone: b.phone,
    email: b.email,
    manager: b.manager,
    isActive: b.isActive,
    createdAt: iso(b.createdAt),
    updatedAt: iso(b.updatedAt),
  };
}

/** Active branches the caller can work with; used by branch pickers everywhere. */
branchesRouter.get('/options', async (req, res) => {
  const ctx = getAuth(req);
  const rows = await prisma.branch.findMany({
    where: { isActive: true, ...(ctx.allBranches ? {} : { id: { in: [...ctx.branchIds] } }) },
    select: { id: true, code: true, name: true },
    orderBy: { name: 'asc' },
  });
  ok<BranchRef[]>(res, rows);
});

branchesRouter.get('/', requirePermission('branches.read'), async (req, res) => {
  const query = parse(branchListQuerySchema, req.query);
  const where: Prisma.BranchWhereInput = {
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { code: { contains: query.q, mode: 'insensitive' } },
            { city: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const sort = orderBy<Prisma.BranchOrderByWithRelationInput>(
    query.sort,
    {
      name: (dir) => ({ name: dir }),
      code: (dir) => ({ code: dir }),
      createdAt: (dir) => ({ createdAt: dir }),
    },
    { name: 'asc' },
  );
  const [rows, total] = await Promise.all([
    prisma.branch.findMany({ where, orderBy: sort, include, ...pageWindow(query) }),
    prisma.branch.count({ where }),
  ]);
  ok(res, rows.map(toDto), pageMeta(query, total));
});

branchesRouter.get('/:id', requirePermission('branches.read'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  const branch = await prisma.branch.findUnique({ where: { id }, include });
  if (!branch) throw notFound('The branch');
  ok(res, toDto(branch));
});

branchesRouter.post('/', requirePermission('branches.manage'), async (req, res) => {
  const input = parse(branchInputSchema, req.body);
  const branch = await withFriendlyErrors(
    () =>
      prisma.$transaction(async (tx) => {
        await assertManager(tx, input.managerUserId);
        const row = await tx.branch.create({
          data: { ...input, managerUserId: input.managerUserId ?? null },
          include,
        });
        await recordAudit(tx, actorFrom(req), {
          action: 'branch.created',
          entityType: 'branch',
          entityId: row.id,
          summary: `Branch ${row.code} – ${row.name} created`,
        });
        return row;
      }),
    DUPLICATE,
  );
  created(res, toDto(branch));
});

branchesRouter.put('/:id', requirePermission('branches.manage'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  const input = parse(branchInputSchema, req.body);
  const branch = await withFriendlyErrors(
    () =>
      prisma.$transaction(async (tx) => {
        const before = await tx.branch.findUnique({ where: { id } });
        if (!before) throw notFound('The branch');
        await assertManager(tx, input.managerUserId);
        const row = await tx.branch.update({
          where: { id },
          data: { ...input, managerUserId: input.managerUserId ?? null },
          include,
        });
        await recordAudit(tx, actorFrom(req), {
          action: 'branch.updated',
          entityType: 'branch',
          entityId: id,
          summary: `Branch ${row.code} updated`,
          changes: diff(before, input, [
            'code',
            'name',
            'addressLine1',
            'city',
            'region',
            'phone',
            'email',
            'managerUserId',
          ]),
        });
        return row;
      }),
    DUPLICATE,
  );
  ok(res, toDto(branch));
});

branchesRouter.patch('/:id/status', requirePermission('branches.manage'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  const { isActive } = parse(branchStatusSchema, req.body);
  const branch = await prisma.$transaction(async (tx) => {
    const before = await tx.branch.findUnique({ where: { id }, include });
    if (!before) throw notFound('The branch');
    if (before.isActive === isActive) return before;
    if (!isActive) {
      const stocked = await tx.stockBalance.count({
        where: { branchId: id, quantityOnHand: { not: 0 } },
      });
      if (stocked > 0) {
        throw invalidState(
          `This branch still holds stock for ${stocked} item(s). Transfer or adjust the stock to zero before deactivating it.`,
        );
      }
    }
    const row = await tx.branch.update({ where: { id }, data: { isActive }, include });
    await recordAudit(tx, actorFrom(req), {
      action: isActive ? 'branch.activated' : 'branch.deactivated',
      entityType: 'branch',
      entityId: id,
      summary: `Branch ${row.code} ${isActive ? 'activated' : 'deactivated'}`,
    });
    return row;
  });
  ok(res, toDto(branch));
});
