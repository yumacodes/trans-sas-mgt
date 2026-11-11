import type { NextFunction, Request, Response } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import { getAuth, type AuthContext } from '../middleware/auth';
import { AppError, forbidden, notFound } from '../lib/errors';

/**
 * Branch scoping policy
 * - Holders of branches.all_access see every branch.
 * - Everyone else sees records of their assigned branches. Branch-optional records
 *   (e.g. clients with no branch) are company-wide and visible to all.
 */

/** Prisma filter for a required branchId column. */
export function branchWhere(ctx: AuthContext) {
  return ctx.allBranches ? {} : { branchId: { in: [...ctx.branchIds] } };
}

/** Prisma filter for an optional branchId column (null = company-wide). */
export function optionalBranchWhere(ctx: AuthContext) {
  return ctx.allBranches
    ? {}
    : { OR: [{ branchId: null }, { branchId: { in: [...ctx.branchIds] } }] };
}

export function canAccessBranch(ctx: AuthContext, branchId: string | null | undefined) {
  if (!branchId) return true;
  return ctx.allBranches || ctx.branchIds.includes(branchId);
}

export function assertBranchAccess(ctx: AuthContext, branchId: string | null | undefined) {
  if (!canAccessBranch(ctx, branchId)) throw forbidden();
}

/** Where a record is saved when the form doesn't say: the user's branch, if they have one. */
export function defaultBranchId(ctx: AuthContext): string | null {
  return ctx.allBranches ? null : (ctx.branchIds[0] ?? null);
}

/**
 * The branch a new document belongs to: the one asked for (if allowed), else the user's own,
 * else the oldest active branch for users who work across all of them.
 */
export async function resolveDocumentBranch(
  db: PrismaClient | Prisma.TransactionClient,
  ctx: AuthContext,
  requested: string | null | undefined,
): Promise<string | null> {
  if (requested) {
    assertBranchAccess(ctx, requested);
    const branch = await db.branch.findUnique({ where: { id: requested }, select: { isActive: true } });
    if (!branch?.isActive) {
      throw new AppError('VALIDATION_FAILED', 'Choose an active branch.', { branchId: 'Choose an active branch.' });
    }
    return requested;
  }
  if (!ctx.allBranches) {
    const own = ctx.branchIds[0];
    if (!own) {
      throw new AppError(
        'VALIDATION_FAILED',
        "You aren't assigned to a branch yet. Ask your administrator to assign you to one.",
      );
    }
    return own;
  }
  const oldest = await db.branch.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return oldest?.id ?? null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * For `router.param('id', ...)`: a record of a branch the user can't see is reported as
 * missing on every route of that router, so no single handler can forget the check.
 */
export function branchGuard(
  label: string,
  lookup: (id: string) => Promise<{ branchId: string | null } | null>,
) {
  return async (req: Request, _res: Response, next: NextFunction, id: string) => {
    try {
      const ctx = getAuth(req);
      if (ctx.allBranches || !UUID.test(id)) return next();
      const row = await lookup(id);
      if (row && !canAccessBranch(ctx, row.branchId)) throw notFound(label);
      next();
    } catch (error) {
      next(error);
    }
  };
}
